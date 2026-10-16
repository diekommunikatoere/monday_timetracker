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
 * - All configured columns of an item are computed once ({@link computeColumnValues}) and
 *   written with a single `change_multiple_column_values` mutation
 *   ({@link updateItemColumnValues}); if that batch fails with a non-transient error, each
 *   column is retried on its own so one bad column doesn't block the others.
 * - Writes use a {@link withRetry} loop with exponential back-off (3 retries, 1 s base),
 *   but only for transient monday failures ({@link isTransientMondayError}).
 * - A Redis-backed debounced queue ({@link queueItemSync} / {@link flushSyncQueue})
 *   absorbs burst writes and deduplicates rapid updates to the same item.
 * - Every item sync is recorded as one `item_sync_log` row (all columns inside) via
 *   {@link writeItemSyncLog}. The older per-column `sync_log` table is read-only history.
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

import type { SyncPurpose, TimeFormat, SyncColumnType, GetItemTimeByRoleResult, CalculateRemainingBudgetResult, ItemSyncLogInsert, ItemSyncLogColumn, Json } from "@/types/database";

// Types

/**
 * Outcome of a single column write-back attempt.
 *
 * One entry per {@link ColumnMapping} is collected into {@link ItemSyncResult.results}
 * and mirrored into the `columns` array of the item's `item_sync_log` row.
 *
 * @property success      - `true` if the value was computed and the monday API accepted the write.
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
 * one remaining computed write-back (see {@link computeColumnValues}'s `budget_used` case).
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
 * Each retry doubles `delay`. After the final attempt — or immediately, when
 * `shouldRetry` returns `false` for the thrown error — the error is re-thrown.
 * Used by {@link updateColumnValue} and {@link updateItemColumnValues} to handle
 * transient monday API failures.
 *
 * @typeParam T     - Return type of `fn`.
 * @param fn          - Async function to retry.
 * @param shouldRetry - Predicate deciding whether an error is worth retrying (default: retry everything).
 * @param retries     - Remaining retry attempts (default {@link MAX_RETRIES} = 3).
 * @param delay       - Delay before the next retry in milliseconds (default {@link INITIAL_DELAY_MS} = 1000).
 * @returns The resolved value of `fn` on the first successful call.
 */
async function withRetry<T>(fn: () => Promise<T>, shouldRetry: (error: unknown) => boolean = () => true, retries = MAX_RETRIES, delay = INITIAL_DELAY_MS): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		if (retries > 0 && shouldRetry(error)) {
			console.log(`Retrying in ${delay}ms... (${retries} retries left)`);
			await sleep(delay);
			return withRetry(fn, shouldRetry, retries - 1, delay * 2);
		}
		throw error;
	}
}

/** monday GraphQL error codes (`errors[].extensions.code`) that clear up on their own. monday often returns these with HTTP 200. */
const TRANSIENT_MONDAY_ERROR_CODES = new Set(["ComplexityException", "RATE_LIMIT_EXCEEDED", "maxConcurrencyExceeded"]);

/**
 * Decide whether a failed monday request is worth retrying.
 *
 * Transient (`true`): anything that is not a `ClientError` (network failure, timeout), HTTP
 * 429 / ≥ 500, and the {@link TRANSIENT_MONDAY_ERROR_CODES} error codes.
 *
 * Everything else — validation errors, a deleted column or item, permissions,
 * `DAILY_LIMIT_EXCEEDED`, unknown `ClientError` shapes — is permanent and fails fast.
 *
 * @param error - The value thrown by the monday client.
 * @returns `true` if a retry may succeed.
 */
export function isTransientMondayError(error: unknown): boolean {
	if (!(error instanceof ClientError)) return true;

	const { status, errors } = error.response;
	if (status === 429 || status >= 500) return true;

	return !!errors?.some((e) => TRANSIENT_MONDAY_ERROR_CODES.has(String(e.extensions?.code)));
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Split the free-form `triggeredBy` string callers pass into the two `item_sync_log` fields.
 *
 * - A UUID is a `user_profiles.id` → `{ trigger_source: "user", actor_id }`.
 * - Any other non-empty string is a source label (e.g. `"webhook:monday-move"`) → `actor_id: null`.
 * - Empty/undefined → `"unknown"`.
 *
 * @param triggeredBy - Actor user ID or source label from the sync entry point.
 */
function resolveTrigger(triggeredBy?: string): { trigger_source: string; actor_id: string | null } {
	if (!triggeredBy) return { trigger_source: "unknown", actor_id: null };
	if (UUID_RE.test(triggeredBy)) return { trigger_source: "user", actor_id: triggeredBy };
	return { trigger_source: triggeredBy, actor_id: null };
}

/**
 * Record one item sync (all columns) as a single `item_sync_log` row.
 *
 * Never throws: a failed insert is only logged to the console so it can't abort the sync path.
 * If the insert violates the `actor_id` foreign key (stale/unknown user), it is retried once
 * without an actor.
 *
 * @param entry - The row to insert (see {@link ItemSyncLogInsert}).
 */
async function writeItemSyncLog(entry: ItemSyncLogInsert): Promise<void> {
	try {
		let { error } = await supabaseAdmin.from("item_sync_log").insert(entry);

		if (error?.code === "23503" && entry.actor_id) {
			({ error } = await supabaseAdmin.from("item_sync_log").insert({ ...entry, actor_id: null }));
		}

		if (error) {
			console.error("Error logging item sync:", error);
		}
	} catch (error) {
		console.error("Error logging item sync:", error);
	}
}

/**
 * Stamp `last_synced_at = now()` on the `column_sync_config` rows that were written successfully.
 *
 * @param configIds - The `column_sync_config.id` UUIDs to update; no-op when empty.
 */
async function updateLastSyncedAt(configIds: string[]): Promise<void> {
	if (configIds.length === 0) return;

	try {
		await supabaseAdmin.from("column_sync_config").update({ last_synced_at: new Date().toISOString() }).in("id", configIds);
	} catch (error) {
		console.error("Error updating last_synced_at:", error);
	}
}

// =====================================
// Monday.com API Functions
// =====================================

/** monday's character limit for a `long_text` column value. */
const LONG_TEXT_MAX_LENGTH = 2000;

/**
 * Build the value placed under a column id in a monday write, per column type.
 *
 * `long_text` takes `{ text }`; `numbers`, `text` and `time_tracking` (written as text for
 * now) take the plain string. Shared by {@link updateColumnValue} and
 * {@link updateItemColumnValues} so both write paths always agree.
 *
 * @param columnType - Column type ({@link SyncColumnType}).
 * @param value      - Pre-formatted string value.
 */
export function formatColumnValue(columnType: SyncColumnType, value: string): string | { text: string } {
	return columnType === "long_text" ? { text: value } : value;
}

/**
 * Unwrap a thrown monday client error into a readable message.
 *
 * @param error - The value thrown by the monday client.
 */
function getMondayErrorMessage(error: unknown): string {
	return error instanceof ClientError ? error.response?.errors?.[0]?.message || error.message : error instanceof Error ? error.message : "Unknown error";
}

/**
 * Write a value to a monday board column via the `change_column_value` mutation.
 *
 * The value is built by {@link formatColumnValue} and JSON-encoded. The mutation is
 * wrapped in {@link withRetry} (transient failures only, see {@link isTransientMondayError}).
 * Errors from `ClientError` are unwrapped for a clean message.
 *
 * Used as the per-column fallback when the batch write in {@link updateItemColumnValues} fails.
 *
 * **Note:** `MONDAY_API_TOKEN` must be set; returns `{ success: false }` immediately
 * when the API client singleton is `null`.
 *
 * @param boardId    - The monday board ID.
 * @param itemId     - The monday item ID to update.
 * @param columnId   - The monday column ID to write to.
 * @param value      - Pre-formatted string value to write (see `formatTime` / `formatTimeByRole*`).
 * @param columnType - Column type, controls the value shape ({@link SyncColumnType}).
 * @returns `{ success: true }` or `{ success: false, error: "<message>" }`.
 */
export async function updateColumnValue(boardId: string, itemId: string, columnId: string, value: string, columnType: SyncColumnType): Promise<{ success: boolean; error?: string }> {
	if (!client) {
		return { success: false, error: "Monday API client not available" };
	}

	const formattedValue = JSON.stringify(formatColumnValue(columnType, value));

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
		}, isTransientMondayError);

		return { success: true };
	} catch (error) {
		const errorMessage = getMondayErrorMessage(error);

		console.error("Error updating monday.com column:", errorMessage);
		return { success: false, error: errorMessage };
	}
}

/**
 * Write several columns of one item with a single `change_multiple_column_values` mutation.
 *
 * Treated as atomic: monday's partial-failure semantics are undocumented, so on failure the
 * caller must assume no column was written. Wrapped in {@link withRetry} (transient failures only).
 *
 * @param boardId - The monday board ID.
 * @param itemId  - The monday item ID to update.
 * @param columns - Columns to write; each id must be unique.
 * @returns `{ success: true }`, or `{ success: false, error, transient }` where `transient`
 *   says the failure was of a kind that already exhausted its retries (monday outage / rate limit).
 */
export async function updateItemColumnValues(boardId: string, itemId: string, columns: Array<{ columnId: string; columnType: SyncColumnType; value: string }>): Promise<{ success: boolean; error?: string; transient?: boolean }> {
	if (!client) {
		return { success: false, error: "Monday API client not available" };
	}

	const columnValues = JSON.stringify(Object.fromEntries(columns.map((c) => [c.columnId, formatColumnValue(c.columnType, c.value)])));

	const mutation = `
		mutation($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
			change_multiple_column_values(
				board_id: $boardId,
				item_id: $itemId,
				column_values: $columnValues
			) {
				id
			}
		}
	`;

	try {
		await withRetry(() => client.request(mutation, { boardId, itemId, columnValues }), isTransientMondayError);

		return { success: true };
	} catch (error) {
		const errorMessage = getMondayErrorMessage(error);

		console.error("Error updating monday.com columns:", errorMessage);
		return { success: false, error: errorMessage, transient: isTransientMondayError(error) };
	}
}

// =====================================
// Main Sync Functions
// =====================================

/**
 * A column mapping together with its computed value, or the reason it has none.
 *
 * @property mapping - The {@link ColumnMapping} this value is for.
 * @property value   - Formatted string to write; undefined when `error` is set.
 * @property error   - Why no value could be produced (computation threw, or a monday limit was exceeded).
 */
interface ComputedColumn {
	mapping: ColumnMapping;
	value?: string;
	error?: string;
}

/** Wrap `fn` so it runs at most once (lazily) and every caller shares the same promise. */
function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
	let promise: Promise<T> | undefined;
	return () => (promise ??= fn());
}

/**
 * Compute the value for every column mapping of one item.
 *
 * Dispatches on {@link ColumnMapping.syncPurpose}: `total_time` → {@link getItemTotalTime},
 * `time_by_role` → {@link getItemTimeByRole}, `remaining_budget` / `budget_used` →
 * {@link calculateRemainingBudget}. Each data source is fetched at most once per call
 * (and only if a mapping needs it), however many columns share it.
 *
 * A computation that throws marks only its own column with `error`. A `long_text` value
 * over monday's 2000-character limit is marked with `error` too, so it is excluded from the write.
 *
 * @param itemId   - The monday item ID (already resolved to parent by {@link syncItemColumns}).
 * @param boardId  - The monday board ID.
 * @param mappings - The enabled column mappings, in order.
 * @returns One {@link ComputedColumn} per mapping, in the same order.
 */
async function computeColumnValues(itemId: string, boardId: string, mappings: ColumnMapping[]): Promise<ComputedColumn[]> {
	const totalTime = memoize(() => getItemTotalTime(itemId, boardId));
	const timeByRole = memoize(() => getItemTimeByRole(itemId, boardId));
	// budgetAmount only affects remaining_budget; total_cost (budget_used) doesn't depend on it, and no
	// budget source column is configured on board_config anymore (monday mirror columns handle budgets).
	const budget = memoize(() => calculateRemainingBudget(boardId, itemId, 0));

	return Promise.all(
		mappings.map(async (mapping): Promise<ComputedColumn> => {
			const { columnId, syncPurpose, columnType, timeFormat, includeBreakdown } = mapping;

			try {
				let value: string;

				switch (syncPurpose) {
					case "total_time": {
						const totalSeconds = await totalTime();
						value = formatTime(totalSeconds, timeFormat);
						console.log(`[ColumnSync] Calculated total_time: ${value} (${totalSeconds}s)`);
						break;
					}

					case "time_by_role": {
						const breakdown = await timeByRole();
						value = columnType === "long_text" || includeBreakdown ? formatTimeByRoleJson(breakdown) : formatTimeByRoleText(breakdown);
						console.log(`[ColumnSync] Calculated time_by_role breakdown for ${breakdown.length} roles`);
						break;
					}

					case "remaining_budget": {
						const budgetResult = await budget();
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
						const budgetResult = await budget();
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

				if (columnType === "long_text" && value.length > LONG_TEXT_MAX_LENGTH) {
					return { mapping, error: `value exceeds monday long_text limit (${LONG_TEXT_MAX_LENGTH} chars)` };
				}

				return { mapping, value };
			} catch (err) {
				console.error(`[ColumnSync] Failed to compute column ${columnId} (${syncPurpose}):`, err);
				return { mapping, error: err instanceof Error ? err.message : "Unknown error" };
			}
		}),
	);
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
 * Computes all column values once, writes them with one `change_multiple_column_values`
 * mutation (falling back to per-column writes on a permanent batch failure) and logs one
 * `item_sync_log` row.
 *
 * @param itemId          - The monday item ID to sync. Sub-items are auto-redirected.
 * @param boardId         - The monday board the item belongs to.
 * @param triggeredBy     - Actor user ID or source label (e.g. `"webhook:monday-move"`), recorded in `item_sync_log` (see {@link resolveTrigger}).
 * @param timeEntryId     - `time_entry.id` that caused this sync, recorded in `item_sync_log`.
 * @param isRecursiveCall - Unused; retained for call-site compatibility with historical linked-board recursion (now removed — mirror columns handle roll-ups).
 * @returns {@link ItemSyncResult} with exactly one outcome per column mapping and an overall success flag.
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

	// Compute every value once, then write them all with one mutation.
	const computed = await computeColumnValues(itemId, boardId, columnMappings);
	const writable = computed.filter((c) => c.value !== undefined);

	const outcomes = new Map<string, { success: boolean; error?: string }>();

	if (writable.length > 0) {
		console.log(`[ColumnSync] Writing ${writable.length} column(s) to monday.com: Board ${boardId}, Item ${itemId}`);
		const batch = await updateItemColumnValues(
			boardId,
			itemId,
			writable.map((c) => ({ columnId: c.mapping.columnId, columnType: c.mapping.columnType, value: c.value! })),
		);

		if (batch.success || writable.length === 1 || batch.transient) {
			// One column has nothing to fall back to; a transient failure already exhausted its retries.
			for (const c of writable) outcomes.set(c.mapping.id, { success: batch.success, error: batch.error });
		} else {
			// Permanent batch failure (e.g. a column deleted in monday): isolate the bad column(s).
			console.warn(`[ColumnSync] Batch write failed for item ${itemId} (${batch.error}); falling back to per-column writes`);
			for (const c of writable) {
				outcomes.set(c.mapping.id, await updateColumnValue(boardId, itemId, c.mapping.columnId, c.value!, c.mapping.columnType));
			}
		}
	}

	const results: SyncResult[] = computed.map((c) => {
		const outcome = c.value === undefined ? { success: false, error: c.error } : outcomes.get(c.mapping.id)!;
		if (!outcome.success) {
			console.error(`[ColumnSync] Failed to update column ${c.mapping.columnId}: ${outcome.error}`);
		}
		return {
			success: outcome.success,
			columnId: c.mapping.columnId,
			syncPurpose: c.mapping.syncPurpose,
			value: c.value ?? "",
			error: outcome.success ? undefined : outcome.error,
		};
	});
	const overallSuccess = results.every((r) => r.success);

	await updateLastSyncedAt(columnMappings.filter((_, i) => results[i].success).map((m) => m.id));

	await writeItemSyncLog({
		board_id: boardId,
		item_id: itemId,
		success: overallSuccess,
		error_message: results.find((r) => !r.success)?.error ?? null,
		columns: results.map<ItemSyncLogColumn>((r) => ({ column_id: r.columnId, sync_purpose: r.syncPurpose, value: r.value, success: r.success, ...(r.error && { error: r.error }) })) as unknown as Json,
		...resolveTrigger(triggeredBy),
		time_entry_id: timeEntryId || null,
	});

	return { itemId, boardId, results, overallSuccess };
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
 * @param userId      - Internal Supabase user ID (passed as `triggeredBy`, logged as the `item_sync_log` actor).
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
 * @property userId      - Actor user ID forwarded to `item_sync_log`.
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
 * @param userId      - Actor user ID forwarded to `item_sync_log`.
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
 * Resolve the item whose columns actually receive time for `itemId`: the parent for a
 * subitem (`monday_item.parent_item_id`), otherwise the item itself. Mirrors the redirect
 * in {@link syncItemColumns}, but done up-front so queue keys dedupe per effective item.
 */
async function resolveEffectiveSyncTarget(itemId: string, boardId: string): Promise<{ itemId: string; boardId: string }> {
	const { data } = await supabaseAdmin.from("monday_item").select("parent_item_id").eq("id", itemId).not("parent_item_id", "is", null).maybeSingle();
	return { itemId: data?.parent_item_id ?? itemId, boardId };
}

/**
 * Queue column syncs after a time entry is updated.
 *
 * Queues the **old** target (resolved from `oldEntry`, i.e. the row as it was before the
 * update — never from the request body) and the **new** target. Each is first resolved to
 * its effective item (a subitem's parent, see {@link resolveEffectiveSyncTarget}) and the
 * pair is deduplicated, so:
 * - an edit that keeps the item (duration, role, comment, owner) queues that item once;
 * - moving between two subitems of the same parent queues the parent once;
 * - moving between different parents, or between a subitem and a top-level item, queues both.
 *
 * There is intentionally no "nothing relevant changed" shortcut: a role change alters the
 * time-by-role and budget columns even when the item is unchanged.
 *
 * Uses {@link queueItemSync} (debounced) rather than {@link syncItemColumns}
 * directly to absorb rapid consecutive edits.
 *
 * @param newEntry - Updated time entry object (needs `.item_id`, `.board_id`, `.id`).
 * @param oldEntry - Previous time entry object before the update.
 * @param userId   - Actor user ID forwarded to `item_sync_log` (the user who made the edit, not necessarily the entry owner).
 */
export async function syncAfterUpdate(newEntry: any, oldEntry: any, userId: string): Promise<void> {
	const targets = new Map<string, { itemId: string; boardId: string; timeEntryId: string }>();

	for (const entry of [oldEntry, newEntry]) {
		if (!entry?.item_id || !entry?.board_id) continue;
		const target = await resolveEffectiveSyncTarget(entry.item_id, entry.board_id);
		targets.set(`${target.itemId}:${target.boardId}`, { ...target, timeEntryId: entry.id });
	}

	for (const target of targets.values()) {
		console.log(`[ColumnSync] Queueing item ${target.itemId} on board ${target.boardId} after update`);
		await queueItemSync(target.itemId, target.boardId, userId, target.timeEntryId);
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
 * @param userId       - Actor user ID forwarded to `item_sync_log`.
 */
export async function syncAfterDelete(deletedEntry: any, userId: string): Promise<void> {
	if (!deletedEntry.item_id || !deletedEntry.board_id) {
		console.log(`[ColumnSync] No item/board for deleted entry ${deletedEntry.id}`);
		return;
	}

	console.log(`[ColumnSync] Queueing item ${deletedEntry.item_id} after delete`);
	await queueItemSync(deletedEntry.item_id, deletedEntry.board_id, userId, deletedEntry.id);
}
