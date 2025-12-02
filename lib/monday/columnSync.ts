/**
 * Monday.com Column Sync Service
 *
 * Provides functionality for:
 * - Fetching board columns for configuration
 * - Updating column values on items
 * - Syncing time tracking data to monday.com boards
 */

import { ApiClient, ClientError } from "@mondaydotcomorg/api";
import { cacheHelper } from "../redis";
import { SyncColumnType, SyncPurpose, TimeFormat } from "@/types/database";

// Cache TTL for columns (5 minutes - columns rarely change)
const COLUMNS_CACHE_TTL = 300;

// Ensure MONDAY_API_TOKEN is set
const token = process.env.MONDAY_API_TOKEN;
if (!token) {
	throw new Error("MONDAY_API_TOKEN is not set in environment variables");
}

// Create client instance once
const client = new ApiClient({ token, apiVersion: "2025-10" });

// ============================================
// Type Definitions
// ============================================

export type MondayColumn = {
	id: string;
	title: string;
	type: string;
	description: string | null;
	settings_str: string;
};

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

// Column types that are compatible with time tracking sync
const COMPATIBLE_COLUMN_TYPES: Record<string, { label: string; purposes: SyncPurpose[] }> = {
	numbers: {
		label: "Numbers",
		purposes: ["total_time", "remaining_budget"],
	},
	text: {
		label: "Text",
		purposes: ["total_time", "time_by_role"],
	},
	long_text: {
		label: "Long Text",
		purposes: ["time_by_role"],
	},
	// Note: time_tracking column type is read-only in monday.com API
};

// ============================================
// Fetch Board Columns
// ============================================

/**
 * Fetches all columns for a specific board
 * Includes compatibility information for sync configuration
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
		console.log(`[getBoardColumns] Cache HIT for board ${boardId} - ${Date.now() - startTime}ms`);
		return cached;
	}

	console.log(`[getBoardColumns] Cache MISS for board ${boardId} - fetching from API`);

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
 * Get only columns compatible with time sync
 */
export async function getCompatibleColumns(boardId: string): Promise<MondayColumnOption[]> {
	const allColumns = await getBoardColumns(boardId);
	return allColumns.filter((col) => col.isCompatible);
}

/**
 * Get columns compatible with a specific sync purpose
 */
export async function getColumnsForPurpose(boardId: string, purpose: SyncPurpose): Promise<MondayColumnOption[]> {
	const allColumns = await getBoardColumns(boardId);
	return allColumns.filter((col) => col.compatiblePurposes.includes(purpose));
}

// ============================================
// Update Column Values
// ============================================

/**
 * GraphQL mutation to update a column value
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

export type UpdateColumnResult = {
	success: boolean;
	itemId?: string;
	itemName?: string;
	error?: string;
};

/**
 * Update a column value on a monday.com item
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
 * Format seconds into various time formats
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
 * Format time breakdown by role as text
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
 * Format remaining budget value
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
 * Update column value with exponential backoff retry
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
 * Invalidate column cache for a specific board
 */
export async function invalidateColumnsCache(boardId: string): Promise<void> {
	await cacheHelper.del(`monday:columns:${boardId}`);
	console.log(`[invalidateColumnsCache] Cleared cache for board ${boardId}`);
}
