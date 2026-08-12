/**
 * lib/monday/columnSync.ts — monday.com column sync service.
 *
 * Write-back layer that pushes computed time values (total time, per-role breakdown,
 * remaining budget) from Supabase into configured monday.com board columns after a
 * time entry is finalized, updated, or deleted.
 *
 * Provides:
 * - {@link getBoardColumns} / {@link getCompatibleColumns} / {@link getColumnsForPurpose}
 *   — fetching and filtering board columns for sync configuration.
 * - {@link updateColumnValue} / {@link updateColumnValueWithRetry}
 *   — writing a value to a specific monday.com column with optional exponential-backoff retry.
 * - {@link formatTimeValue} / {@link formatTimeByRoleBreakdown} / {@link formatBudgetValue}
 *   — formatting helpers for the three sync-purpose value types.
 * - {@link invalidateColumnsCache} — cache invalidation after column schema changes.
 *
 * Column compatibility metadata ({@link COMPATIBLE_COLUMN_TYPES}) and purpose helpers
 * live in `./utils` and are re-exported here for consumer convenience.
 */

import { ClientError } from "@mondaydotcomorg/api";

import { SyncPurpose, TimeFormat } from "@/types/database";

import { cacheHelper } from "../redis";
import { createMondayClient } from "./client";
import { COMPATIBLE_COLUMN_TYPES, isPurposeCompatible, isTimePurpose } from "./utils";

// Re-export shared utilities for convenience
export { COMPATIBLE_COLUMN_TYPES, isPurposeCompatible, isTimePurpose };

// Cache TTL for columns (5 minutes - columns rarely change)
const COLUMNS_CACHE_TTL = 300;

// Ensure MONDAY_API_TOKEN is set
const token = process.env.MONDAY_API_TOKEN;
if (!token) {
	throw new Error("MONDAY_API_TOKEN is not set in environment variables");
}

// Create client instance once
const client = createMondayClient();

// ============================================
// Type Definitions
// ============================================

/**
 * Raw monday.com column as returned by the `boards.columns` GraphQL field.
 *
 * @property id           - Stable column ID used in mutations (e.g. `"numbers0"`).
 * @property title        - Human-readable column name shown in the board UI.
 * @property type         - monday column type string (e.g. `"numbers"`, `"text"`, `"long_text"`).
 * @property description  - Optional column description set by the board owner. `null` when absent.
 * @property settings_str - Raw JSON string of column settings (board-relation targets, etc.).
 */
export type MondayColumn = {
	id: string;
	title: string;
	type: string;
	description: string | null;
	settings_str: string;
};

/**
 * A monday.com column enriched with sync-compatibility metadata, returned by
 * {@link getBoardColumns} for display in the admin column-mapping UI.
 *
 * @property id                  - Stable column ID (same as {@link MondayColumn.id}).
 * @property title               - Column name shown in the UI.
 * @property type                - monday column type string.
 * @property typeLabel           - Human-readable label from {@link COMPATIBLE_COLUMN_TYPES}, or falls back to `type`.
 * @property description         - Column description or `null`.
 * @property isCompatible        - `true` when this column type can receive any sync value.
 * @property compatiblePurposes  - Which {@link SyncPurpose} values this column type accepts.
 */
export type MondayColumnOption = {
	id: string;
	title: string;
	type: string;
	typeLabel: string;
	description: string | null;
	isCompatible: boolean; // Whether it can be used for time sync
	compatiblePurposes: SyncPurpose[];
};

type BoardColumnsResponse = {
	boards: Array<{
		id: string;
		name: string;
		columns: MondayColumn[];
	}>;
	error?: {
		message: string;
		status: number;
	};
};

type ChangeColumnValueResponse = {
	change_column_value: {
		id: string;
		name: string;
	};
	error?: {
		message: string;
		status: number;
	};
};

// ============================================
// Fetch Board Columns
// ============================================

/**
 * Fetches all columns for a monday.com board, annotated with sync-compatibility metadata.
 *
 * Results are cached in Redis under `monday:columns:<boardId>` for
 * {@link COLUMNS_CACHE_TTL} seconds (5 minutes). Use {@link invalidateColumnsCache}
 * after column schema changes.
 *
 * @param boardId - Valid positive-integer monday.com board ID (string form).
 * @returns Array of {@link MondayColumnOption} in the order returned by the API.
 * @throws If `boardId` is not a valid positive integer, the board is not found, or on API errors.
 */
export async function getBoardColumns(boardId: string): Promise<MondayColumnOption[]> {
	if (!boardId || isNaN(Number(boardId)) || Number(boardId) <= 0) {
		throw new Error("boardId must be a valid positive integer");
	}

	const startTime = Date.now();
	const cacheKey = `monday:columns:${boardId}`;

	// Try cache first
	const cached = await cacheHelper.get<MondayColumnOption[]>(cacheKey);
	if (cached) {
		return cached;
	}

	const query = `
		query GetBoardColumns($boardId: ID!) {
			boards(ids: [$boardId]) {
				id
				name
				columns {
					id
					title
					type
					description
					settings_str
				}
			}
		}
	`;

	try {
		const response: BoardColumnsResponse = await client.request(query, { boardId });

		if (response.error) {
			console.error("Monday API error in getBoardColumns:", response.error?.message);
			throw new Error(response.error?.message || "Failed to fetch board columns");
		}

		const board = response.boards?.[0];
		if (!board) {
			throw new Error(`Board ${boardId} not found`);
		}

		// Transform columns with compatibility info
		const columns: MondayColumnOption[] = board.columns.map((col) => {
			const compatInfo = COMPATIBLE_COLUMN_TYPES[col.type];
			return {
				id: col.id,
				title: col.title,
				type: col.type,
				typeLabel: compatInfo?.label || col.type,
				description: col.description,
				isCompatible: !!compatInfo,
				compatiblePurposes: compatInfo?.purposes || [],
			};
		});

		// Cache the result
		await cacheHelper.set(cacheKey, columns, COLUMNS_CACHE_TTL);

		console.log(`[getBoardColumns] API fetch complete for board ${boardId} - ${Date.now() - startTime}ms`);
		return columns;
	} catch (error) {
		if (error instanceof ClientError) {
			console.error("ClientError in getBoardColumns:", error.response?.errors);
		}
		console.error("Error in getBoardColumns:", error);
		throw new Error(`Failed to fetch columns for board ${boardId}`);
	}
}

/**
 * Returns only the columns from {@link getBoardColumns} where `isCompatible` is `true` —
 * i.e. columns whose type can receive at least one {@link SyncPurpose} value.
 *
 * @param boardId - Valid positive-integer monday.com board ID.
 * @returns Filtered subset of {@link MondayColumnOption}.
 */
export async function getCompatibleColumns(boardId: string): Promise<MondayColumnOption[]> {
	const allColumns = await getBoardColumns(boardId);
	return allColumns.filter((col) => col.isCompatible);
}

/**
 * Returns only the columns from {@link getBoardColumns} that support a given
 * {@link SyncPurpose} (e.g. `"total_time"`, `"time_by_role"`, `"remaining_budget"`).
 *
 * Use this to populate a column-picker restricted to the purpose the admin is configuring.
 *
 * @param boardId - Valid positive-integer monday.com board ID.
 * @param purpose - The {@link SyncPurpose} to filter by.
 * @returns Columns whose `compatiblePurposes` includes `purpose`.
 */
export async function getColumnsForPurpose(boardId: string, purpose: SyncPurpose): Promise<MondayColumnOption[]> {
	const allColumns = await getBoardColumns(boardId);
	return allColumns.filter((col) => col.compatiblePurposes.includes(purpose));
}

// ============================================
// Update Column Values
// ============================================

/**
 * GraphQL mutation used by {@link updateColumnValue} to write a single column value.
 * The `value` variable must be a **JSON-encoded string** (monday's API requires this).
 */
const CHANGE_COLUMN_VALUE_MUTATION = `
	mutation ChangeColumnValue($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
		change_column_value(
			board_id: $boardId
			item_id: $itemId
			column_id: $columnId
			value: $value
		) {
			id
			name
		}
	}
`;

/**
 * Return value from {@link updateColumnValue} and {@link updateColumnValueWithRetry}.
 *
 * @property success   - `true` if the mutation succeeded.
 * @property itemId    - monday.com item ID echoed back from the mutation response.
 * @property itemName  - Item name echoed back from the mutation response.
 * @property error     - Human-readable error message when `success` is `false`.
 */
export type UpdateColumnResult = {
	success: boolean;
	itemId?: string;
	itemName?: string;
	error?: string;
};

/**
 * Writes a value to a single column on a monday.com item.
 *
 * The `value` is JSON-serialised before being sent — monday.com requires all
 * column values to be passed as a JSON string even for primitive types.
 *
 * Does **not** retry on failure. For write-back paths that need resilience, use
 * {@link updateColumnValueWithRetry} instead.
 *
 * @param boardId  - monday.com board ID containing the item.
 * @param itemId   - monday.com item ID to update.
 * @param columnId - Column ID to write (e.g. `"numbers0"`).
 * @param value    - The value to write; will be `JSON.stringify`-ed before the API call.
 * @returns {@link UpdateColumnResult} — check `success` before trusting other fields.
 */
export async function updateColumnValue(boardId: string, itemId: string, columnId: string, value: string | number): Promise<UpdateColumnResult> {
	const startTime = Date.now();

	try {
		// Format value as JSON string (monday.com expects JSON for column values)
		const formattedValue = JSON.stringify(value);

		const response: ChangeColumnValueResponse = await client.request(CHANGE_COLUMN_VALUE_MUTATION, {
			boardId,
			itemId,
			columnId,
			value: formattedValue,
		});

		if (response.error) {
			console.error(`[updateColumnValue] API error:`, response.error);
			return {
				success: false,
				error: response.error.message,
			};
		}

		console.log(`[updateColumnValue] Updated column ${columnId} on item ${itemId} - ${Date.now() - startTime}ms`);

		return {
			success: true,
			itemId: response.change_column_value?.id,
			itemName: response.change_column_value?.name,
		};
	} catch (error) {
		if (error instanceof ClientError) {
			const errorMessage = error.response?.errors?.[0]?.message || "Unknown client error";
			console.error(`[updateColumnValue] ClientError:`, error.response?.errors);
			return {
				success: false,
				error: errorMessage,
			};
		}

		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		console.error(`[updateColumnValue] Error:`, error);
		return {
			success: false,
			error: errorMessage,
		};
	}
}

// ============================================
// Time Formatting Utilities
// ============================================

/**
 * Converts a duration in seconds into the display format specified by `format`.
 *
 * - `"hours"`   — decimal hours rounded to 2 decimal places (e.g. `2.5`).
 * - `"seconds"` — raw integer seconds passed through unchanged.
 * - `"hh:mm"`   — zero-padded hours and minutes string (e.g. `"02:30"`). Seconds are truncated.
 *
 * @param totalSeconds - Duration to format. // Duration in seconds
 * @param format       - One of the {@link TimeFormat} values from `@/types/database`.
 * @returns A number for `"hours"` / `"seconds"`, a string for `"hh:mm"`.
 */
export function formatTimeValue(totalSeconds: number, format: TimeFormat): string | number {
	switch (format) {
		case "hours":
			// Return decimal hours (e.g., 2.5 for 2h 30m)
			return Number((totalSeconds / 3600).toFixed(2));
		case "seconds":
			return totalSeconds;
		case "hh:mm":
			const hours = Math.floor(totalSeconds / 3600);
			const minutes = Math.floor((totalSeconds % 3600) / 60);
			return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
		default:
			return totalSeconds;
	}
}

/**
 * Formats a per-role time breakdown as a multi-line text string suitable for
 * writing to a monday `text` or `long_text` column.
 *
 * Each line is `"<roleName>: <formattedTime>"`. When `includeTotal` is `true`
 * (default) a `"Total: <time>"` line is appended.
 *
 * Returns `"No time tracked"` when `breakdown` is empty.
 *
 * @param breakdown       - Array of `{ roleName, totalSeconds, color? }` entries.
 *                          `totalSeconds` is the accumulated tracked time for that role. // Duration in seconds
 * @param options.includeTotal - Append a total-time line. Default: `true`.
 * @param options.format       - {@link TimeFormat} applied to all time values. Default: `"hh:mm"`.
 * @returns Newline-separated string.
 */
export function formatTimeByRoleBreakdown(breakdown: Array<{ roleName: string; totalSeconds: number; color?: string }>, options: { includeTotal?: boolean; format?: TimeFormat } = {}): string {
	const { includeTotal = true, format = "hh:mm" } = options;

	if (breakdown.length === 0) {
		return "No time tracked";
	}

	const lines = breakdown.map((item) => {
		const formattedTime = formatTimeValue(item.totalSeconds, format);
		const timeStr = typeof formattedTime === "number" ? `${formattedTime}h` : formattedTime;
		return `${item.roleName}: ${timeStr}`;
	});

	if (includeTotal) {
		const totalSeconds = breakdown.reduce((sum, item) => sum + item.totalSeconds, 0);
		const formattedTotal = formatTimeValue(totalSeconds, format);
		const totalStr = typeof formattedTotal === "number" ? `${formattedTotal}h` : formattedTotal;
		lines.push(`Total: ${totalStr}`);
	}

	return lines.join("\n");
}

/**
 * Formats a remaining-budget monetary value as a currency string.
 *
 * Defaults to the Euro symbol (`"€"`). Negative values are prefixed with `"-"`;
 * when `showNegative` is `false`, negatives are clamped to `"€0"`.
 *
 * **Note**: the currency symbol is a display-only hint — no exchange-rate logic is applied.
 *
 * @param remaining                   - Budget amount (may be negative for over-budget). // Monetary value
 * @param options.currencySymbol      - Symbol prepended to the formatted value. Default: `"€"`.
 * @param options.showNegative        - If `false`, values below zero are shown as `<symbol>0`. Default: `true`.
 * @returns Formatted string, e.g. `"€1234.56"`, `"-€23.00"`, or `"€0"`.
 */
export function formatBudgetValue(remaining: number, options: { currencySymbol?: string; showNegative?: boolean } = {}): string {
	const { currencySymbol = "€", showNegative = true } = options;

	if (remaining < 0 && !showNegative) {
		return `${currencySymbol}0`;
	}

	const formatted = Math.abs(remaining).toFixed(2);
	const prefix = remaining < 0 ? "-" : "";
	return `${prefix}${currencySymbol}${formatted}`;
}

// ============================================
// Sync Operations with Retry Logic
// ============================================

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Writes a column value with exponential-backoff retry on transient errors.
 *
 * Retries up to `retries` times (default: {@link MAX_RETRIES} = 3). A failure is
 * considered retryable when the error message contains `"rate"`, `"timeout"`,
 * `"network"`, `"502"`, or `"503"`. Non-retryable errors (permission, schema) abort
 * immediately without waiting.
 *
 * Initial delay is {@link INITIAL_RETRY_DELAY} ms (1 s); each retry doubles the delay.
 *
 * @param boardId  - monday.com board ID.
 * @param itemId   - monday.com item ID.
 * @param columnId - Column ID to update.
 * @param value    - Value to write.
 * @param retries  - Maximum number of attempts. Default: 3.
 * @returns {@link UpdateColumnResult} from the last attempt.
 */
export async function updateColumnValueWithRetry(boardId: string, itemId: string, columnId: string, value: string | number, retries = MAX_RETRIES): Promise<UpdateColumnResult> {
	let lastError: string | undefined;
	let delay = INITIAL_RETRY_DELAY;

	for (let attempt = 1; attempt <= retries; attempt++) {
		const result = await updateColumnValue(boardId, itemId, columnId, value);

		if (result.success) {
			return result;
		}

		lastError = result.error;

		// Check if error is retryable (rate limit, network issues)
		const isRetryable = lastError?.includes("rate") || lastError?.includes("timeout") || lastError?.includes("network") || lastError?.includes("502") || lastError?.includes("503");

		if (!isRetryable || attempt === retries) {
			break;
		}

		console.log(`[updateColumnValueWithRetry] Attempt ${attempt} failed, retrying in ${delay}ms...`);
		await new Promise((resolve) => setTimeout(resolve, delay));
		delay *= 2; // Exponential backoff
	}

	return {
		success: false,
		error: lastError || "Max retries exceeded",
	};
}

// ============================================
// Cache Invalidation
// ============================================

/**
 * Removes the Redis column cache entry for `boardId` (`monday:columns:<boardId>`).
 *
 * Call this after the admin changes column mappings or after a board's column
 * schema is known to have changed, so the next {@link getBoardColumns} call
 * fetches fresh data rather than returning stale column definitions.
 *
 * @param boardId - monday.com board ID whose column cache should be cleared.
 */
export async function invalidateColumnsCache(boardId: string): Promise<void> {
	await cacheHelper.del(`monday:columns:${boardId}`);
	console.log(`[invalidateColumnsCache] Cleared cache for board ${boardId}`);
}
