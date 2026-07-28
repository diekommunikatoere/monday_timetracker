/**
 * lib/columnSync.ts — Column write-back orchestrator for monday.com board columns.
 *
 * After a time entry is finalized, updated, or deleted, this module computes the
 * configured sync values (total time, per-role breakdown, remaining budget, budget used)
 * and writes them to monday board columns via the monday.com GraphQL API.
 *
 * Architecture:
 * - Board-level control lives in `board_config` (sync enabled/disabled, budget column,
 *   linked-board roll-up). Column-level targets live in `column_sync_config`.
 * - Heavy time math is handled by Postgres RPC functions (`get_item_total_time`,
 *   `get_item_time_by_role`, `calculate_remaining_budget`); results are formatted here.
 * - Sub-items are automatically redirected to their parent item's columns.
 * - Writes use a {@link withRetry} loop with exponential back-off (3 retries, 1 s base).
 * - A Redis-backed debounced queue ({@link queueItemSync} / {@link flushSyncQueue})
 *   absorbs burst writes and deduplicates rapid updates to the same item.
 * - Every write attempt is recorded in the `sync_log` table via {@link logSyncOperation}.
 *
 * Main entry points:
 * - {@link syncAfterFinalize} — called from the finalize time-entry API route.
 * - {@link syncAfterUpdate}   — called when a time entry is edited.
 * - {@link syncAfterDelete}   — called when a time entry is deleted (soft-delete aware).
 * - {@link syncItemColumns}   — sync all configured columns for an item directly.
 */

import { ClientError } from "@mondaydotcomorg/api";

import { parseNumericColumnText } from "@/lib/monday/utils";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { SyncPurpose, TimeFormat, SyncColumnType, GetItemTimeByRoleResult, CalculateRemainingBudgetResult } from "@/types/database";

// Types

/**
 * Outcome of a single column write-back attempt.
 *
 * Returned by the internal `syncColumn` function and collected into
 * {@link ItemSyncResult.results}. Also written to `sync_log` by
 * `logSyncOperation`.
 *
 * @property success      - `true` if the monday API accepted the write.
 * @property columnId     - The monday column ID that was written to.
 * @property syncPurpose  - What kind of data was written (see {@link SyncPurpose}).
 * @property value        - The string value that was sent to monday (empty on error).
 * @property error        - Error message; only present when `success` is `false`.
 */
export interface SyncResult {
	success: boolean;
	columnId: string;
	syncPurpose: SyncPurpose;
	value: string;
	error?: string;
}

/**
 * Aggregate outcome of syncing all configured columns for one item.
 *
 * Returned by {@link syncItemColumns} and {@link syncAfterFinalize}.
 * `overallSuccess` is `true` only when every {@link SyncResult} in `results`
 * succeeded; callers should check individual entries for partial-failure detail.
 *
 * @property itemId          - The monday item ID that was synced.
 * @property boardId         - The monday board containing the item.
 * @property results         - Per-column outcomes (one per enabled {@link ColumnMapping}).
 * @property overallSuccess  - `true` iff all column writes succeeded.
 */
export interface ItemSyncResult {
	itemId: string;
	boardId: string;
	results: SyncResult[];
	overallSuccess: boolean;
}

/**
 * Per-role time summary returned by {@link getItemTimeByRole}.
 *
 * Assembled from the `get_item_time_by_role` RPC result, then enriched with
 * the role's `color_hex` from the `role` table. Passed to the `formatTimeByRole*`
 * functions to produce the string written to a monday column.
 *
 * @property roleId        - Internal UUID of the role.
 * @property roleName      - Display name (e.g. `"Developer"`).
 * @property totalSeconds  - Summed tracked time for this role, in **seconds**.
 * @property formattedTime - Human-readable total via {@link formatTimeHumanReadable} (e.g. `"2h 30m"`).
 * @property entryCount    - Number of finalized time entries contributing to the total.
 * @property colorHex      - Optional role colour from `role.color_hex`; undefined if unset.
 */
export interface RoleTimeBreakdown {
	roleId: string;
	roleName: string;
	totalSeconds: number;
	formattedTime: string;
	entryCount: number;
	colorHex?: string;
}

/**
 * Resolved `board_config` row, mapped from snake_case to camelCase.
 *
 * Fetched by {@link getBoardConfig} from the `board_config` table (joined with
 * `monday_board` for the display name). This shape is used throughout this module
 * rather than the raw DB `BoardConfig` alias from `@/types/database`.
 *
 * Budget source and linked-board roll-up now live on monday's own mirror
 * columns, so `sync_enabled` is the only sync gate left — `budget_used` is the
 * one remaining computed write-back (see `syncColumn`'s `budget_used` case).
 *
 * @property boardId     - monday board ID (string representation of the numeric ID).
 * @property boardName   - Display name from `monday_board.name`; falls back to `"Unbenanntes Board"`.
 * @property syncEnabled - Master switch; when `false`, all sync calls are no-ops.
 */
export interface BoardConfig {
	boardId: string;
	boardName: string;
	syncEnabled: boolean;
}

/**
 * Resolved `column_sync_config` row, mapped from snake_case to camelCase.
 *
 * Fetched by {@link getColumnMappings}. Each instance describes one monday column
 * that should receive a computed value on sync. Only rows with `sync_enabled = true`
 * are returned; the `id` field is used to update `last_synced_at` after a successful write.
 *
 * @property id               - Internal UUID of the `column_sync_config` row.
 * @property columnId         - The monday column ID to write to.
 * @property columnName       - Display name (cosmetic; not sent to monday).
 * @property columnType       - monday API column type, determines how `value` is JSON-encoded. See {@link SyncColumnType}.
 * @property syncPurpose      - What is computed and written. See {@link SyncPurpose}.
 * @property timeFormat       - Formatting applied to time values. See {@link TimeFormat}.
 * @property includeBreakdown - For `time_by_role`: if `true`, formats as JSON instead of plain text.
 * @property syncEnabled      - Always `true` here (filtered at query time by {@link getColumnMappings}).
 */
export interface ColumnMapping {
	id: string;
	columnId: string;
	columnName: string;
	columnType: SyncColumnType;
	syncPurpose: SyncPurpose;
	timeFormat: TimeFormat;
	includeBreakdown: boolean;
	syncEnabled: boolean;
}

// API client singleton
const token = process.env.MONDAY_API_TOKEN;
if (!token) {
	console.warn("MONDAY_API_TOKEN is not set - column sync will be disabled");
}
const client = token ? createMondayClient() : null;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration to sleep in milliseconds.
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry `fn` up to `retries` times with exponential back-off on failure.
 *
 * Each retry doubles `delay`. After the final attempt the error is re-thrown.
 * Used by {@link updateColumnValue} to handle transient monday API failures.
 *
 * @typeParam T     - Return type of `fn`.
 * @param fn        - Async function to retry.
 * @param retries   - Remaining retry attempts (default {@link MAX_RETRIES} = 3).
 * @param delay     - Delay before the next retry in milliseconds (default {@link INITIAL_DELAY_MS} = 1000).
 * @returns The resolved value of `fn` on the first successful call.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_DELAY_MS): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (retries > 0) {
			console.log(`Retrying in ${delay}ms... (${retries} retries left)`);
			await sleep(delay);
			return withRetry(fn, retries - 1, delay * 2);
		}
		throw error;
	}
}

// =====================================
// Time Formatting Functions
// =====================================

/**
 * Format a duration in seconds to the string representation required by a monday column.
 *
 * - `"hours"`   → decimal hours rounded to 2 dp (e.g. `"2.50"` for 2h 30m).
 * - `"seconds"` → raw integer as a string (e.g. `"9000"`).
 * - `"hh:mm"`   → zero-padded clock string (e.g. `"02:30"`).
 *
 * The `format` value comes from {@link ColumnMapping.timeFormat} and is stored in
 * `column_sync_config.time_format`. Unknown values fall back to decimal hours.
 *
 * @param seconds - Duration to format, in **seconds**.
 * @param format  - Target {@link TimeFormat} for the output string.
 * @returns Formatted string suitable for sending to the monday API.
 */
export function formatTime(seconds: number, format: TimeFormat): string {
	switch (format) {
		case "hours":
			// Return decimal hours (e.g., 5.5 for 5h 30m)
			return (seconds / 3600).toFixed(2);
		case "seconds":
			return seconds.toString();
		case "hh:mm":
			const hours = Math.floor(seconds / 3600);
			const minutes = Math.floor((seconds % 3600) / 60);
			return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
		default:
			return (seconds / 3600).toFixed(2);
	}
}

/**
 * Format a duration in seconds as a compact human-readable string for display.
 *
 * Examples: `"5h 30m"`, `"45m"`, `"3h"`, `"0m"` (when both hours and minutes are 0).
 * Seconds are **always discarded** — sub-minute precision is intentionally dropped.
 * Used when building the `time_by_role` text/JSON written to monday columns, and
 * in log messages within this module.
 *
 * @param seconds - Duration in **seconds**.
 * @returns Human-readable duration string (e.g. `"5h 30m"`).
 */
export function formatTimeHumanReadable(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (hours === 0 && minutes === 0) {
		return "0m";
	} else if (hours === 0) {
		return `${minutes}m`;
	} else if (minutes === 0) {
		return `${hours}h`;
	}
	return `${hours}h ${minutes}m`;
}

/**
 * Format a per-role time breakdown as a newline-delimited plain-text string.
 *
 * Each role occupies one line (`"<RoleName>: <formattedTime>"`), followed by a
 * `"Total: <formattedTime>"` summary line. Returns `"No time tracked"` when
 * `breakdown` is empty.
 *
 * Used when a `time_by_role` column is of type `text` and
 * {@link ColumnMapping.includeBreakdown} is `false`. For `long_text` or when
 * `includeBreakdown` is `true`, use {@link formatTimeByRoleJson} instead.
 *
 * @param breakdown - Array of {@link RoleTimeBreakdown} entries.
 * @returns Newline-separated plain-text summary.
 */
export function formatTimeByRoleText(breakdown: RoleTimeBreakdown[]): string {
	if (breakdown.length === 0) {
		return "No time tracked";
	}

	const lines = breakdown.map((role) => `${role.roleName}: ${formatTimeHumanReadable(role.totalSeconds)}`);

	const totalSeconds = breakdown.reduce((sum, role) => sum + role.totalSeconds, 0);
	lines.push(`Total: ${formatTimeHumanReadable(totalSeconds)}`);

	return lines.join("\n");
}

/**
 * Format a per-role time breakdown as a JSON string for `long_text` monday columns.
 *
 * Produces a structured object with a `breakdown` array (role name, ID, seconds,
 * formatted time, and colour hex per role) and a `total` summary. This richer
 * format lets monday automations or integrations parse the data programmatically.
 *
 * Used when `columnType` is `"long_text"` or {@link ColumnMapping.includeBreakdown}
 * is `true`. For plain text, use {@link formatTimeByRoleText}.
 *
 * @param breakdown - Array of {@link RoleTimeBreakdown} entries.
 * @returns JSON string representing the breakdown object.
 */
export function formatTimeByRoleJson(breakdown: RoleTimeBreakdown[]): string {
	const totalSeconds = breakdown.reduce((sum, role) => sum + role.totalSeconds, 0);

	return JSON.stringify({
		breakdown: breakdown.map((role) => ({
			role: role.roleName,
			roleId: role.roleId,
			seconds: role.totalSeconds,
			formatted: formatTimeHumanReadable(role.totalSeconds),
			color: role.colorHex,
		})),
		total: {
			seconds: totalSeconds,
			formatted: formatTimeHumanReadable(totalSeconds),
		},
	});
}

// =====================================
// Database Functions
// =====================================

/**
 * Load the sync configuration for a monday board.
 *
 * Queries `board_config` joined with `monday_board` (for the display name).
 * Returns `null` when no row exists for `boardId` — callers treat this as
 * "sync not configured" and skip.
 *
 * @param boardId - The monday board ID to look up.
 * @returns Resolved {@link BoardConfig} or `null` if unconfigured.
 */
export async function getBoardConfig(boardId: string): Promise<BoardConfig | null> {
	const { data, error } = await supabaseAdmin.from("board_config").select("*, monday_board(name)").eq("board_id", boardId).single();

	if (error || !data) {
		return null;
	}

	return {
		boardId: data.board_id,
		boardName: (data as any).monday_board?.name || "Unbenanntes Board",
		syncEnabled: !!(data as any).sync_enabled,
	};
}

/**
 * Load all enabled column sync targets for a monday board.
 *
 * Returns only rows from `column_sync_config` where `sync_enabled = true`.
 * Returns an empty array (never throws) when the board has no configured columns
 * or on a DB error.
 *
 * @param boardId - The monday board ID.
 * @returns Array of {@link ColumnMapping} instances; empty if none configured.
 */
export async function getColumnMappings(boardId: string): Promise<ColumnMapping[]> {
	const { data, error } = await supabaseAdmin.from("column_sync_config").select("*").eq("board_id", boardId).eq("sync_enabled", true);

	if (error || !data) {
		return [];
	}

	return data.map((config) => ({
		id: config.id,
		columnId: config.column_id,
		columnName: config.column_name,
		columnType: config.column_type as SyncColumnType,
		syncPurpose: config.sync_purpose as SyncPurpose,
		timeFormat: config.time_format as TimeFormat,
		includeBreakdown: config.include_breakdown,
		syncEnabled: config.sync_enabled,
	}));
}

/**
 * Return the total tracked time for a monday item.
 *
 * Calls the `get_item_total_time` Postgres RPC.
 *
 * @param itemId  - The monday item ID.
 * @param boardId - The monday board containing the item (unused; kept for call-site symmetry with the other `getItem*` helpers).
 * @param userId  - Optional: filter to a specific user's entries only.
 * @returns Total tracked time in **seconds**, or `0` on error.
 */
export async function getItemTotalTime(itemId: string, boardId: string, userId?: string): Promise<number> {
	const { data, error } = await supabaseAdmin.rpc("get_item_total_time", {
		p_item_ids: [itemId],
		p_user_id: userId || null,
	} as any);

	if (error) {
		console.error("Error getting item total time:", error);
		return 0;
	}

	return data || 0;
}

/**
 * Return per-role time breakdown for a monday item.
 *
 * Calls the `get_item_time_by_role` Postgres RPC, then enriches each row with the
 * role's `color_hex` from the `role` table.
 *
 * @param itemId  - The monday item ID.
 * @param boardId - The monday board containing the item (unused; kept for call-site symmetry with the other `getItem*` helpers).
 * @param userId  - Optional: filter to a specific user's entries only.
 * @returns Array of {@link RoleTimeBreakdown} (one per role with tracked time); empty on error.
 */
export async function getItemTimeByRole(itemId: string, boardId: string, userId?: string): Promise<RoleTimeBreakdown[]> {
	const { data, error } = (await supabaseAdmin.rpc("get_item_time_by_role", {
		p_item_ids: [itemId],
		p_user_id: userId || null,
	} as any)) as { data: GetItemTimeByRoleResult[] | null; error: any };

	if (error || !data) {
		console.error("Error getting item time by role:", error);
		return [];
	}

	// Get role colors
	const roleIds = data.map((r) => r.role_id);
	const { data: roles } = await supabaseAdmin.from("role").select("id, color_hex").in("id", roleIds);

	const colorMap = new Map(roles?.map((r) => [r.id, r.color_hex]) || []);

	return data.map((role) => ({
		roleId: role.role_id,
		roleName: role.role_name,
		totalSeconds: role.total_seconds,
		formattedTime: formatTimeHumanReadable(role.total_seconds),
		entryCount: role.entry_count,
		colorHex: colorMap.get(role.role_id) || undefined,
	}));
}

/**
 * Read a numeric budget amount from a monday board column.
 *
 * Used to obtain the budget figure before computing `remaining_budget` or
 * `budget_used`. The column may be a `numbers`, `formula`, or `mirror` column
 * (see {@link BudgetColumnType}). The value is parsed from the column's `.text`
 * property, which handles both US (`1,234.56`) and European (`1.234,56`) number
 * formats by detecting whether the last separator is a comma or a dot.
 *
 * Returns `null` if the monday API is unavailable, the item/column isn't found,
 * or the text cannot be parsed as a finite number.
 *
 * @param boardId  - The monday board ID.
 * @param itemId   - The monday item ID to read the column value from.
 * @param columnId - The monday column ID that holds the budget amount.
 * @returns Parsed budget as a `number`, or `null` on failure.
 */
export async function getBudgetFromColumn(boardId: string, itemId: string, columnId: string): Promise<number | null> {
	if (!client) {
		console.warn("Monday API client not available");
		return null;
	}

	const query = `
		query($boardId: ID!, $itemId: ID!, $columnId: String!) {
			boards(ids: [$boardId]) {
				items_page(limit: 1, query_params: { ids: [$itemId] }) {
					items {
						column_values(ids: [$columnId]) {
							id
							text
							value
						}
					}
				}
			}
		}
	`;

	try {
		const response: any = await client.request(query, {
			boardId,
			itemId,
			columnId,
		});

		const items = response.boards?.[0]?.items_page?.items;
		if (!items || items.length === 0) {
			return null;
		}

		const columnValue = items[0].column_values?.[0];
		if (!columnValue) {
			return null;
		}

		// Parse the .text property (most reliable for Mirror/Formula) — shared with
		// the bulk getBudgetBoardItems path so both agree on number formatting.
		return parseNumericColumnText(columnValue.text);
	} catch (error) {
		console.error("Error fetching budget from monday.com:", error);
		return null;
	}
}

/**
 * Compute the remaining budget for a monday item via the `calculate_remaining_budget` RPC.
 *
 * The RPC computes `total_cost` (tracked time × effective hourly rate) and subtracts
 * it from `budgetAmount` to yield `remaining_budget`.
 *
 * The `budgetAmount` is typically obtained from {@link getBudgetFromColumn}; pass `0`
 * when no budget column is configured (the RPC will still return cost figures).
 *
 * @param boardId      - The monday board ID.
 * @param itemId       - The monday item ID.
 * @param budgetAmount - Budget to subtract cost from (currency units, e.g. euros/hours).
 * @param userId       - Optional: filter to a specific user's entries only.
 * @returns {@link CalculateRemainingBudgetResult} with cost and remaining figures, or `null` on error.
 */
export async function calculateRemainingBudget(boardId: string, itemId: string, budgetAmount: number, userId?: string): Promise<CalculateRemainingBudgetResult | null> {
	const { data, error } = (await supabaseAdmin.rpc("calculate_remaining_budget", {
		p_board_id: boardId,
		p_item_ids: [itemId],
		p_budget_amount: budgetAmount,
		p_user_id: userId || null,
	} as any)) as { data: CalculateRemainingBudgetResult[] | null; error: any };

	if (error || !data || data.length === 0) {
		console.error("Error calculating remaining budget:", error);
		return null;
	}

	return data[0];
}

/**
 * Record a column write attempt in the `sync_log` table.
 *
 * Called at the end of `syncColumn` regardless of success or failure, providing
 * an audit trail for debugging and monitoring sync health. Failures here are
 * swallowed (logged to console only) so they never abort the sync path.
 *
 * @param boardId      - The monday board ID.
 * @param itemId       - The monday item ID that was synced.
 * @param columnId     - The monday column ID that was written.
 * @param syncPurpose  - What kind of data was synced ({@link SyncPurpose}).
 * @param valueSynced  - The string value that was sent (empty string on error).
 * @param success      - Whether the monday API accepted the write.
 * @param errorMessage - Error detail on failure.
 * @param triggeredBy  - Identifier of the actor that triggered the sync (e.g. user ID or cron name).
 * @param timeEntryId  - The `time_entry.id` that caused this sync, if applicable.
 */
async function logSyncOperation(boardId: string, itemId: string, columnId: string, syncPurpose: SyncPurpose, valueSynced: string, success: boolean, errorMessage?: string, triggeredBy?: string, timeEntryId?: string): Promise<void> {
	try {
		await supabaseAdmin.from("sync_log").insert({
			board_id: boardId,
			item_id: itemId,
			column_id: columnId,
			sync_purpose: syncPurpose,
			value_synced: valueSynced,
			success,
			error_message: errorMessage || null,
			triggered_by: triggeredBy || null,
			time_entry_id: timeEntryId || null,
		});
	} catch (error) {
		console.error("Error logging sync operation:", error);
	}
}

/**
 * Stamp `last_synced_at = now()` on a `column_sync_config` row after a successful write.
 *
 * @param configId - The `column_sync_config.id` UUID to update.
 */
async function updateLastSyncedAt(configId: string): Promise<void> {
	try {
		await supabaseAdmin.from("column_sync_config").update({ last_synced_at: new Date().toISOString() }).eq("id", configId);
	} catch (error) {
		console.error("Error updating last_synced_at:", error);
	}
}

// =====================================
// Monday.com API Functions
// =====================================

/**
 * Write a value to a monday board column via the `change_column_value` mutation.
 *
 * The `value` string is JSON-encoded differently depending on `columnType`:
 * - `"numbers"`, `"text"`, `"long_text"`, `"time_tracking"` all receive a
 *   JSON-stringified string (i.e. `JSON.stringify(value)`).
 *
 * The mutation is wrapped in {@link withRetry} for resilience against transient
 * monday API errors. Errors from `ClientError` are unwrapped for a clean message.
 *
 * **Note:** `MONDAY_API_TOKEN` must be set; returns `{ success: false }` immediately
 * when the API client singleton is `null`.
 *
 * @param boardId    - The monday board ID.
 * @param itemId     - The monday item ID to update.
 * @param columnId   - The monday column ID to write to.
 * @param value      - Pre-formatted string value to write (see `formatTime` / `formatTimeByRole*`).
 * @param columnType - Column type, controls JSON encoding ({@link SyncColumnType}).
 * @returns `{ success: true }` or `{ success: false, error: "<message>" }`.
 */
export async function updateColumnValue(boardId: string, itemId: string, columnId: string, value: string, columnType: SyncColumnType): Promise<{ success: boolean; error?: string }> {
	if (!client) {
		return { success: false, error: "Monday API client not available" };
	}

	// Format value based on column type
	let formattedValue: string;
	switch (columnType) {
		case "numbers":
			// Numbers column expects a JSON-encoded string value
			formattedValue = JSON.stringify(value);
			break;
		case "text":
		case "long_text":
			// Text columns expect a string
			formattedValue = JSON.stringify(value);
			break;
		case "time_tracking":
			// Time tracking column has a specific format
			// For now, we'll use text columns instead
			formattedValue = JSON.stringify(value);
			break;
		default:
			formattedValue = JSON.stringify(value);
	}

	const mutation = `
		mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
			change_column_value(
				board_id: $boardId,
				item_id: $itemId,
				column_id: $columnId,
				value: $value
			) {
				id
			}
		}
	`;

	try {
		await withRetry(async () => {
			const response: any = await client.request(mutation, {
				boardId,
				itemId,
				columnId,
				value: formattedValue,
			});

			if (response.error) {
				throw new Error(response.error.message || "Failed to update column");
			}

			return response;
		});

		return { success: true };
	} catch (error) {
		const errorMessage = error instanceof ClientError ? error.response?.errors?.[0]?.message || error.message : error instanceof Error ? error.message : "Unknown error";

		console.error("Error updating monday.com column:", errorMessage);
		return { success: false, error: errorMessage };
	}
}

// =====================================
// Main Sync Functions
// =====================================

/**
 * Compute and write the value for one column mapping on a monday item.
 *
 * Dispatches on {@link ColumnMapping.syncPurpose} to fetch the right data
 * (`total_time` → {@link getItemTotalTime}, `time_by_role` → {@link getItemTimeByRole},
 * `remaining_budget` / `budget_used` → {@link getBudgetFromColumn} + {@link calculateRemainingBudget}),
 * formats the result, calls {@link updateColumnValue}, updates `last_synced_at`
 * on success, and always calls {@link logSyncOperation}.
 *
 * `value` is set to `""` when the computation itself throws; the error is captured
 * and reported in the returned {@link SyncResult}.
 *
 * @param boardId       - The monday board ID.
 * @param itemId        - The monday item ID (already resolved to parent by {@link syncItemColumns}).
 * @param columnMapping - The enabled {@link ColumnMapping} to process.
 * @param boardConfig   - Loaded {@link BoardConfig} for the board.
 * @param triggeredBy   - Actor string forwarded to {@link logSyncOperation}.
 * @param timeEntryId   - `time_entry.id` forwarded to {@link logSyncOperation}.
 * @returns {@link SyncResult} describing the outcome.
 */
async function syncColumn(boardId: string, itemId: string, columnMapping: ColumnMapping, boardConfig: BoardConfig, triggeredBy?: string, timeEntryId?: string): Promise<SyncResult> {
	const { columnId, syncPurpose, columnType, timeFormat, includeBreakdown } = columnMapping;

	console.log(`[ColumnSync] Syncing column ${columnId} (${syncPurpose}) for item ${itemId} on board ${boardId}`);

	let value: string;
	let success = false;
	let error: string | undefined;

	try {
		switch (syncPurpose) {
			case "total_time": {
				const totalSeconds = await getItemTotalTime(itemId, boardId);
				value = formatTime(totalSeconds, timeFormat);
				console.log(`[ColumnSync] Calculated total_time: ${value} (${totalSeconds}s)`);
				break;
			}

			case "time_by_role": {
				const breakdown = await getItemTimeByRole(itemId, boardId);
				if (columnType === "long_text" || includeBreakdown) {
					value = formatTimeByRoleJson(breakdown);
				} else {
					value = formatTimeByRoleText(breakdown);
				}
				console.log(`[ColumnSync] Calculated time_by_role breakdown for ${breakdown.length} roles`);
				break;
			}

			case "remaining_budget": {
				// Legacy purpose; the budget source column is no longer configured on
				// board_config (monday mirror columns handle budget amounts now).
				const budgetResult = await calculateRemainingBudget(boardId, itemId, 0);
				if (budgetResult) {
					value = budgetResult.remaining_budget.toFixed(2);
					console.log(`[ColumnSync] Calculated remaining_budget: ${value} (Total Cost: ${budgetResult.total_cost})`);
				} else {
					value = "0.00";
					console.log(`[ColumnSync] Failed to calculate remaining_budget, defaulting to 0.00`);
				}
				break;
			}

			case "budget_used": {
				// budgetAmount only affects remaining_budget; total_cost (what we write here)
				// doesn't depend on it, so 0 is safe now that no budget column is configured.
				const budgetResult = await calculateRemainingBudget(boardId, itemId, 0);
				if (budgetResult) {
					value = budgetResult.total_cost.toFixed(2);
					console.log(`[ColumnSync] Calculated budget_used (Total Cost): ${value}`);
				} else {
					value = "0.00";
					console.log(`[ColumnSync] Failed to calculate budget_used, defaulting to 0.00`);
				}
				break;
			}

			default:
				throw new Error(`Unknown sync purpose: ${syncPurpose}`);
		}

		// Update the column in monday.com
		console.log(`[ColumnSync] Sending update to monday.com: Board ${boardId}, Item ${itemId}, Column ${columnId}, Value ${value}`);
		const updateResult = await updateColumnValue(boardId, itemId, columnId, value, columnType);
		success = updateResult.success;
		error = updateResult.error;

		if (success) {
			console.log(`[ColumnSync] Successfully updated column ${columnId} for item ${itemId}`);
		} else {
			console.error(`[ColumnSync] Failed to update column ${columnId}: ${error}`);
		}

		// Update last_synced_at
		if (success) {
			await updateLastSyncedAt(columnMapping.id);
		}
	} catch (err) {
		error = err instanceof Error ? err.message : "Unknown error";
		value = "";
	}

	// Log the sync operation
	await logSyncOperation(boardId, itemId, columnId, syncPurpose, value, success, error, triggeredBy, timeEntryId);

	return {
		success,
		columnId,
		syncPurpose,
		value,
		error,
	};
}

/**
 * Sync all enabled column mappings for a monday item.
 *
 * This is the core dispatch function used by all public sync entry points.
 *
 * **Sub-item redirect:** if the item has a `parent_item_id` in the `monday_item`
 * table, the call is transparently re-dispatched to the parent. This ensures
 * sub-item time always accumulates to the parent's columns.
 *
 * **Guard conditions** that return an empty success result without syncing:
 * - No `board_config` row for `boardId`.
 * - `boardConfig.syncEnabled` is `false`.
 * - No enabled `column_sync_config` rows for `boardId`.
 *
 * @param itemId          - The monday item ID to sync. Sub-items are auto-redirected.
 * @param boardId         - The monday board the item belongs to.
 * @param triggeredBy     - Actor string forwarded to `sync_log` (e.g. user ID or `"cron"`).
 * @param timeEntryId     - `time_entry.id` that caused this sync, forwarded to `sync_log`.
 * @param isRecursiveCall - Unused; retained for call-site compatibility with historical linked-board recursion (now removed — mirror columns handle roll-ups).
 * @returns {@link ItemSyncResult} with per-column outcomes and overall success flag.
 */
export async function syncItemColumns(itemId: string, boardId: string, triggeredBy?: string, timeEntryId?: string, isRecursiveCall = false): Promise<ItemSyncResult> {
	console.log(`[ColumnSync] syncItemColumns called for item ${itemId} on board ${boardId} (isRecursiveCall: ${isRecursiveCall})`);

	// Resolve parent ID if this is a sub-item
	// Check monday_item dimension table for parent relationship
	const { data: parentInfo } = await supabaseAdmin.from("monday_item").select("parent_item_id").eq("id", itemId).not("parent_item_id", "is", null).maybeSingle();

	if (parentInfo?.parent_item_id) {
		console.log(`[ColumnSync] Item ${itemId} is a sub-item. Redirecting sync to parent ${parentInfo.parent_item_id}`);
		return syncItemColumns(parentInfo.parent_item_id, boardId, triggeredBy, timeEntryId, isRecursiveCall);
	}

	const results: SyncResult[] = [];

	// Get board config
	const boardConfig = await getBoardConfig(boardId);
	if (!boardConfig) {
		console.warn(`[ColumnSync] No board config found for board ${boardId}`);
		return {
			itemId,
			boardId,
			results: [],
			overallSuccess: true,
		};
	}

	if (!boardConfig.syncEnabled) {
		console.log(`[ColumnSync] Sync disabled for board ${boardId}`);
		return {
			itemId,
			boardId,
			results: [],
			overallSuccess: true,
		};
	}

	// Get column mappings
	const columnMappings = await getColumnMappings(boardId);
	if (columnMappings.length === 0) {
		console.log(`[ColumnSync] No column mappings found for board ${boardId}`);
		return {
			itemId,
			boardId,
			results: [],
			overallSuccess: true,
		};
	}

	console.log(`[ColumnSync] Found ${columnMappings.length} column mappings for board ${boardId}`);

	// Sync each configured column — sync_enabled (checked above) is the only board-level gate left.
	for (const mapping of columnMappings) {
		const result = await syncColumn(boardId, itemId, mapping, boardConfig, triggeredBy, timeEntryId);
		results.push(result);
	}

	return {
		itemId,
		boardId,
		results,
		overallSuccess: results.every((r) => r.success),
	};
}

/**
 * Return `true` if the board's config has `sync_enabled` set.
 *
 * Used as a fast gate in {@link syncAfterFinalize} before doing any heavier work.
 * Returns `false` when no config exists for `boardId`.
 *
 * @param boardId - The monday board ID to check.
 * @returns `true` if column sync should fire on time-entry finalization.
 */
export async function shouldSyncOnFinalize(boardId: string): Promise<boolean> {
	const boardConfig = await getBoardConfig(boardId);
	return boardConfig?.syncEnabled || false;
}

/**
 * Trigger a full column sync for an item after a time entry is finalized.
 *
 * **Primary entry point** called from `app/api/timer/finalize/route.ts` (and
 * anywhere else the finalize flow runs). First calls {@link shouldSyncOnFinalize}
 * as a cheap guard; returns `null` without syncing when sync is disabled.
 *
 * On partial failure the result is returned (not thrown) so the caller can
 * decide whether to surface the error to the user.
 *
 * @param itemId      - The monday item ID of the finalized entry.
 * @param boardId     - The monday board the item belongs to.
 * @param userId      - Internal Supabase user ID (passed as `triggeredBy` to `sync_log`).
 * @param timeEntryId - The `time_entry.id` that was just finalized.
 * @returns {@link ItemSyncResult} or `null` when sync is disabled/skipped.
 */
export async function syncAfterFinalize(itemId: string, boardId: string, userId: string, timeEntryId: string): Promise<ItemSyncResult | null> {
	// Check if we should sync
	const shouldSync = await shouldSyncOnFinalize(boardId);
	if (!shouldSync) {
		console.log(`[ColumnSync] Sync not enabled for board ${boardId}`);
		return null;
	}

	console.log(`[ColumnSync] Starting sync for item ${itemId} on board ${boardId}`);

	try {
		const result = await syncItemColumns(itemId, boardId, userId, timeEntryId);

		if (result.overallSuccess) {
			console.log(`[ColumnSync] Successfully synced ${result.results.length} columns for item ${itemId}`);
		} else {
			const failedColumns = result.results.filter((r) => !r.success);
			console.log(`[ColumnSync] Failed columns data: `, failedColumns);
			console.warn(
				`[ColumnSync] Sync completed with ${failedColumns.length} failures for item ${itemId}:`,
				failedColumns.map((f) => ({ column: f.columnId, error: f.error })),
			);
		}

		return result;
	} catch (error) {
		console.error(`[ColumnSync] Error syncing item ${itemId}:`, error);
		return {
			itemId,
			boardId,
			results: [],
			overallSuccess: false,
		};
	}
}

// =====================================
// Sync Queue System (Redis-backed)
// =====================================

/**
 * Payload stored in Redis for a deferred sync request.
 *
 * Keys are written under `sync_queue:<itemId>:<boardId>` with a
 * {@link SYNC_QUEUE_TTL}-second TTL. Because the key encodes the item+board,
 * a later queue call for the same target simply overwrites the value — achieving
 * deduplication for burst writes.
 *
 * @property itemId      - The monday item ID to sync.
 * @property boardId     - The monday board the item belongs to.
 * @property userId      - Actor user ID forwarded to `sync_log`.
 * @property timeEntryId - Optional `time_entry.id` that triggered the queue.
 * @property queuedAt    - Unix epoch (ms) when the item was enqueued.
 */
interface SyncQueueItem {
	itemId: string;
	boardId: string;
	userId: string;
	timeEntryId?: string;
	queuedAt: number; // Unix epoch milliseconds
}

// Import cacheHelper for Redis operations
import { cacheHelper } from "@/lib/redis";

import { createMondayClient } from "./monday/client";

const SYNC_QUEUE_PREFIX = "sync_queue:";
const SYNC_QUEUE_TTL = 15; // seconds
const DEBOUNCE_DELAY = 10000; // 10 seconds in milliseconds
const MAX_QUEUE_SIZE = 1000;
const MAX_CONCURRENT_SYNCS = 10;

let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Enqueue a monday item for a deferred column sync with debouncing and deduplication.
 *
 * Stores a {@link SyncQueueItem} in Redis under `sync_queue:<itemId>:<boardId>` with
 * a {@link SYNC_QUEUE_TTL}-second TTL. Writing the same key again overwrites the
 * previous entry, so rapid updates to the same item collapse into one sync.
 *
 * A {@link DEBOUNCE_DELAY}-ms in-process timer is reset on each call. When it
 * fires it calls {@link flushSyncQueue}. If the queue exceeds {@link MAX_QUEUE_SIZE}
 * entries, the flush happens immediately without waiting for the debounce.
 *
 * **Caveat:** the debounce timer is module-level and therefore per-process. In a
 * serverless environment with short-lived functions, the timer may never fire —
 * rely on {@link flushSyncQueue} being called explicitly (e.g. from the cleanup cron)
 * as the reliable drain path.
 *
 * @param itemId      - The monday item ID.
 * @param boardId     - The monday board the item belongs to.
 * @param userId      - Actor user ID forwarded to `sync_log`.
 * @param timeEntryId - Optional `time_entry.id` that caused this queue request.
 */
export async function queueItemSync(itemId: string, boardId: string, userId: string, timeEntryId?: string): Promise<void> {
	const queueKey = `${SYNC_QUEUE_PREFIX}${itemId}:${boardId}`;

	// Store in Redis with TTL
	const queueItem: SyncQueueItem = {
		itemId,
		boardId,
		userId,
		timeEntryId,
		queuedAt: Date.now(),
	};

	await cacheHelper.set(queueKey, JSON.stringify(queueItem), SYNC_QUEUE_TTL);

	// Check queue size and force flush if needed
	const queueSize = await getQueueSize();
	if (queueSize >= MAX_QUEUE_SIZE) {
		console.warn(`[ColumnSync] Queue size (${queueSize}) exceeded max (${MAX_QUEUE_SIZE}), forcing flush`);
		await flushSyncQueue();
		return;
	}

	// Start or reset debounce timer
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}

	debounceTimer = setTimeout(async () => {
		await flushSyncQueue();
	}, DEBOUNCE_DELAY);
}

/**
 * Return the current number of pending items in the Redis sync queue.
 *
 * Counts all keys matching `sync_queue:*`. Returns `0` on Redis error so callers
 * can safely continue.
 */
async function getQueueSize(): Promise<number> {
	try {
		const keys = await cacheHelper.keys(`${SYNC_QUEUE_PREFIX}*`);
		return keys.length;
	} catch (error) {
		console.error("[ColumnSync] Error getting queue size:", error);
		return 0;
	}
}

/**
 * Drain and process all pending items in the Redis sync queue.
 *
 * Reads every `sync_queue:*` key, parses the stored {@link SyncQueueItem} payloads,
 * delegates to {@link processQueueBatch} (which runs syncs with a
 * {@link MAX_CONCURRENT_SYNCS}-item concurrency cap), then deletes the processed
 * keys from Redis. Cancels any pending debounce timer.
 *
 * Called automatically by the {@link queueItemSync} debounce timer, by the
 * `cleanup-soft-deletes` cron as a backstop, and immediately when the queue
 * exceeds {@link MAX_QUEUE_SIZE}.
 */
export async function flushSyncQueue(): Promise<void> {
	// Clear debounce timer
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}

	try {
		// Get all queue keys
		const keys = await cacheHelper.keys(`${SYNC_QUEUE_PREFIX}*`);

		if (keys.length === 0) {
			return;
		}

		console.log(`[ColumnSync] Flushing sync queue with ${keys.length} items`);

		// Fetch all queue items
		const queueItems: SyncQueueItem[] = [];
		for (const key of keys) {
			const itemJson = await cacheHelper.get<string>(key);
			if (itemJson) {
				try {
					const item = JSON.parse(itemJson);
					queueItems.push(item);
				} catch (err) {
					console.error(`[ColumnSync] Error parsing queue item ${key}:`, err);
				}
			}
		}

		// Process items in parallel with concurrency limit
		const results = await processQueueBatch(queueItems);

		// Delete processed keys from Redis
		for (const key of keys) {
			await cacheHelper.del(key);
		}

		const successCount = results.filter((r) => r.overallSuccess).length;
		console.log(`[ColumnSync] Queue flush complete: ${successCount}/${results.length} successful`);
	} catch (error) {
		console.error("[ColumnSync] Error flushing sync queue:", error);
	}
}

/**
 * Run {@link syncItemColumns} for a list of queued items with bounded concurrency.
 *
 * Splits `items` into batches of {@link MAX_CONCURRENT_SYNCS} and uses
 * `Promise.all` within each batch. Errors for individual items are caught and
 * returned as failed {@link ItemSyncResult}s so one bad item doesn't abort the rest.
 *
 * @param items - Array of {@link SyncQueueItem}s to process.
 * @returns Array of {@link ItemSyncResult}s in the same order as `items`.
 */
async function processQueueBatch(items: SyncQueueItem[]): Promise<ItemSyncResult[]> {
	const results: ItemSyncResult[] = [];
	const batches: SyncQueueItem[][] = [];

	// Split into batches of MAX_CONCURRENT_SYNCS
	for (let i = 0; i < items.length; i += MAX_CONCURRENT_SYNCS) {
		batches.push(items.slice(i, i + MAX_CONCURRENT_SYNCS));
	}

	// Process each batch
	for (const batch of batches) {
		const batchResults = await Promise.all(
			batch.map(async (item) => {
				try {
					return await syncItemColumns(item.itemId, item.boardId, item.userId, item.timeEntryId);
				} catch (error) {
					console.error(`[ColumnSync] Error syncing item ${item.itemId}:`, error);
					return {
						itemId: item.itemId,
						boardId: item.boardId,
						results: [],
						overallSuccess: false,
					};
				}
			}),
		);
		results.push(...batchResults);
	}

	return results;
}

/**
 * Queue column syncs after a time entry is updated.
 *
 * When the entry has been moved to a different item or board, **both** the old
 * and the new target are queued so columns on both sides reflect the change.
 * If the item/board is unchanged, only the new target is queued.
 *
 * Uses {@link queueItemSync} (debounced) rather than {@link syncItemColumns}
 * directly to absorb rapid consecutive edits.
 *
 * @param newEntry - Updated time entry object (needs `.item_id`, `.board_id`, `.id`).
 * @param oldEntry - Previous time entry object before the update.
 * @param userId   - Actor user ID forwarded to `sync_log`.
 */
export async function syncAfterUpdate(newEntry: any, oldEntry: any, userId: string): Promise<void> {
	const itemChanged = oldEntry.item_id !== newEntry.item_id || oldEntry.board_id !== newEntry.board_id;

	if (itemChanged && oldEntry.item_id && oldEntry.board_id) {
		console.log(`[ColumnSync] Item changed - queueing old item ${oldEntry.item_id}`);
		await queueItemSync(oldEntry.item_id, oldEntry.board_id, userId, oldEntry.id);
	}

	if (newEntry.item_id && newEntry.board_id) {
		console.log(`[ColumnSync] Queueing updated item ${newEntry.item_id}`);
		await queueItemSync(newEntry.item_id, newEntry.board_id, userId, newEntry.id);
	}
}

/**
 * Queue a column sync after a time entry is deleted (including soft-delete).
 *
 * Skips silently when the deleted entry has no `item_id` or `board_id` (e.g.
 * a manually entered entry with no monday association). Otherwise queues the item
 * via {@link queueItemSync} so the columns reflect the removed time.
 *
 * @param deletedEntry - The deleted (or soft-deleted) time entry object.
 * @param userId       - Actor user ID forwarded to `sync_log`.
 */
export async function syncAfterDelete(deletedEntry: any, userId: string): Promise<void> {
	if (!deletedEntry.item_id || !deletedEntry.board_id) {
		console.log(`[ColumnSync] No item/board for deleted entry ${deletedEntry.id}`);
		return;
	}

	console.log(`[ColumnSync] Queueing item ${deletedEntry.item_id} after delete`);
	await queueItemSync(deletedEntry.item_id, deletedEntry.board_id, userId, deletedEntry.id);
}
