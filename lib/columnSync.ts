/**
 * Column Sync Service
 *
 * Handles syncing time tracking data to monday.com board columns.
 * Supports total time, time-by-role breakdown, and remaining budget calculations.
 */

import { ApiClient, ClientError } from "@mondaydotcomorg/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { findLinkedItems } from "./monday";
import type { SyncPurpose, TimeFormat, SyncColumnType, GetItemTimeByRoleResult, CalculateRemainingBudgetResult } from "@/types/database";

// Types
export interface SyncResult {
	success: boolean;
	columnId: string;
	syncPurpose: SyncPurpose;
	value: string;
	error?: string;
}

export interface ItemSyncResult {
	itemId: string;
	boardId: string;
	results: SyncResult[];
	overallSuccess: boolean;
}

export interface RoleTimeBreakdown {
	roleId: string;
	roleName: string;
	totalSeconds: number;
	formattedTime: string;
	entryCount: number;
	colorHex?: string;
}

export interface BoardConfig {
	boardId: string;
	boardName: string;
	syncEnabled: boolean;
	syncOnFinalize: boolean;
	syncTotalTime: boolean;
	syncTimeByRole: boolean;
	syncRemainingBudget: boolean;
	syncBudgetUsed: boolean;
	linkedBoardId: string | null;
	syncLinkedItems: boolean;
	currencySymbol: string;
	budgetColumnId: string | null;
	budgetColumnType: string | null;
}

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
const client = token ? new ApiClient({ token, apiVersion: "2025-10" }) : null;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
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
 * Format seconds to the specified time format
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
 * Format time for human-readable display (e.g., "5h 30m")
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
 * Format time breakdown by role as a text string
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
 * Format time breakdown by role as JSON for long_text columns
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
 * Get board configuration
 */
export async function getBoardConfig(boardId: string): Promise<BoardConfig | null> {
	const { data, error } = await supabaseAdmin.from("board_config").select("*").eq("board_id", boardId).single();

	if (error || !data) {
		return null;
	}

	return {
		boardId: data.board_id,
		boardName: data.board_name,
		syncEnabled: data.sync_enabled,
		syncOnFinalize: data.sync_on_finalize,
		syncTotalTime: data.sync_total_time,
		syncTimeByRole: data.sync_time_by_role,
		syncRemainingBudget: data.sync_remaining_budget,
		syncBudgetUsed: data.sync_budget_used,
		linkedBoardId: data.linked_board_id,
		syncLinkedItems: data.sync_linked_items,
		currencySymbol: data.currency_symbol,
		budgetColumnId: data.budget_column_id,
		budgetColumnType: data.budget_column_type,
	};
}

/**
 * Get column mappings for a board
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
 * Get total time for an item (using database function)
 */
export async function getItemTotalTime(itemId: string, boardId: string, userId?: string): Promise<number> {
	// Find linked items to include in the total (roll-up)
	let itemIds = [itemId];
	const boardConfig = await getBoardConfig(boardId);
	if (boardConfig?.syncLinkedItems && boardConfig.linkedBoardId) {
		const linkedIds = await findLinkedItems(boardId, itemId, boardConfig.linkedBoardId);
		itemIds = [...itemIds, ...linkedIds];
	}

	const { data, error } = await supabaseAdmin.rpc("get_item_total_time", {
		p_item_ids: itemIds,
		p_user_id: userId || null,
	} as any);

	if (error) {
		console.error("Error getting item total time:", error);
		return 0;
	}

	return data || 0;
}

/**
 * Get time breakdown by role for an item (using database function)
 */
export async function getItemTimeByRole(itemId: string, boardId: string, userId?: string): Promise<RoleTimeBreakdown[]> {
	// Find linked items to include in the breakdown (roll-up)
	let itemIds = [itemId];
	const boardConfig = await getBoardConfig(boardId);
	if (boardConfig?.syncLinkedItems && boardConfig.linkedBoardId) {
		const linkedIds = await findLinkedItems(boardId, itemId, boardConfig.linkedBoardId);
		itemIds = [...itemIds, ...linkedIds];
	}

	const { data, error } = (await supabaseAdmin.rpc("get_item_time_by_role", {
		p_item_ids: itemIds,
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
 * Get budget value from a monday.com column
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

		// Try to parse as number from the .text property (most reliable for Mirror/Formula)
		const text = columnValue.text || "";
		if (!text) return null;

		// Robust number extraction:
		// 1. Remove all characters except digits, dots, and commas
		// 2. Identify the decimal separator (last dot or comma)
		// 3. Normalize to standard float format (dot as decimal, no thousands separator)
		let cleaned = text.replace(/[^0-9.,-]/g, "");

		// Find the last occurrence of a dot or comma
		const lastDot = cleaned.lastIndexOf(".");
		const lastComma = cleaned.lastIndexOf(",");

		if (lastComma > lastDot) {
			// Comma is likely the decimal separator (European format)
			// Remove all dots (thousands separators) and replace the last comma with a dot
			cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
		} else if (lastDot > lastComma) {
			// Dot is likely the decimal separator (US format)
			// Remove all commas (thousands separators)
			cleaned = cleaned.replace(/,/g, "");
		} else {
			// No separators or only one type - just remove commas if any (assuming they are thousands separators if no dot)
			// Actually, if there's only a comma, it might be a decimal separator.
			// Let's assume if there's only one separator and it's a comma, it's a decimal separator if it's followed by 1-2 digits.
			if (lastComma !== -1 && cleaned.length - lastComma <= 3) {
				cleaned = cleaned.replace(/,/g, ".");
			}
		}

		const parsedValue = parseFloat(cleaned);
		return isNaN(parsedValue) ? null : parsedValue;
	} catch (error) {
		console.error("Error fetching budget from monday.com:", error);
		return null;
	}
}

/**
 * Calculate remaining budget for an item
 */
export async function calculateRemainingBudget(boardId: string, itemId: string, budgetAmount: number, userId?: string): Promise<CalculateRemainingBudgetResult | null> {
	// Find linked items to include in the calculation (roll-up)
	let itemIds = [itemId];
	const boardConfig = await getBoardConfig(boardId);
	if (boardConfig?.syncLinkedItems && boardConfig.linkedBoardId) {
		const linkedIds = await findLinkedItems(boardId, itemId, boardConfig.linkedBoardId);
		itemIds = [...itemIds, ...linkedIds];
	}

	const { data, error } = (await supabaseAdmin.rpc("calculate_remaining_budget", {
		p_board_id: boardId,
		p_item_ids: itemIds,
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
 * Log a sync operation to the database
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
 * Update last_synced_at for a column config
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
 * Update a column value in monday.com
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
 * Sync a single column for an item
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
				// Get budget from the configured budget column
				let budgetAmount = 0;
				if (boardConfig.budgetColumnId) {
					const budget = await getBudgetFromColumn(boardId, itemId, boardConfig.budgetColumnId);
					budgetAmount = budget || 0;
					console.log(`[ColumnSync] Fetched budget amount from column ${boardConfig.budgetColumnId}: ${budgetAmount}`);
				}

				const budgetResult = await calculateRemainingBudget(boardId, itemId, budgetAmount);
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
				// Get budget from the configured budget column (needed for RPC)
				let budgetAmount = 0;
				if (boardConfig.budgetColumnId) {
					const budget = await getBudgetFromColumn(boardId, itemId, boardConfig.budgetColumnId);
					budgetAmount = budget || 0;
					console.log(`[ColumnSync] Fetched budget amount for budget_used calculation: ${budgetAmount}`);
				}

				const budgetResult = await calculateRemainingBudget(boardId, itemId, budgetAmount);
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
 * Sync all configured columns for an item
 */
export async function syncItemColumns(itemId: string, boardId: string, triggeredBy?: string, timeEntryId?: string, isRecursiveCall = false): Promise<ItemSyncResult> {
	console.log(`[ColumnSync] syncItemColumns called for item ${itemId} on board ${boardId} (isRecursiveCall: ${isRecursiveCall})`);

	// Resolve parent ID if this is a sub-item
	// We check if any time entry for this itemId has a parent_item_id
	const { data: parentInfo } = await supabaseAdmin.from("time_entry").select("parent_item_id").eq("item_id", itemId).not("parent_item_id", "is", null).limit(1).maybeSingle();

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

	// Filter mappings based on board config settings
	const enabledMappings = columnMappings.filter((mapping) => {
		let isEnabled = false;
		switch (mapping.syncPurpose) {
			case "total_time":
				isEnabled = boardConfig.syncTotalTime;
				break;
			case "time_by_role":
				isEnabled = boardConfig.syncTimeByRole;
				break;
			case "remaining_budget":
				isEnabled = boardConfig.syncRemainingBudget;
				break;
			case "budget_used":
				isEnabled = boardConfig.syncBudgetUsed;
				break;
			default:
				isEnabled = true;
		}
		if (!isEnabled) {
			console.log(`[ColumnSync] Sync purpose ${mapping.syncPurpose} is disabled in board config for board ${boardId}`);
		}
		return isEnabled;
	});

	console.log(`[ColumnSync] ${enabledMappings.length} mappings are enabled for sync on board ${boardId}`);

	// Sync each column
	for (const mapping of enabledMappings) {
		const result = await syncColumn(boardId, itemId, mapping, boardConfig, triggeredBy, timeEntryId);
		results.push(result);
	}

	const result: ItemSyncResult = {
		itemId,
		boardId,
		results,
		overallSuccess: results.every((r) => r.success),
	};

	// Recursive sync for linked items (if enabled and not already in a recursive call)
	console.log(`[ColumnSync] Checking for recursive sync: isRecursiveCall=${isRecursiveCall}, syncLinkedItems=${boardConfig.syncLinkedItems}, linkedBoardId=${boardConfig.linkedBoardId}`);
	if (!isRecursiveCall && boardConfig.syncLinkedItems && boardConfig.linkedBoardId) {
		try {
			console.log(`[ColumnSync] Searching for linked items on board ${boardConfig.linkedBoardId} for item ${itemId}`);
			const linkedItemIds = await findLinkedItems(boardId, itemId, boardConfig.linkedBoardId);
			if (linkedItemIds.length > 0) {
				console.log(`[ColumnSync] Found ${linkedItemIds.length} linked items on board ${boardConfig.linkedBoardId} for item ${itemId}: ${linkedItemIds.join(", ")}`);
				for (const linkedId of linkedItemIds) {
					console.log(`[ColumnSync] Triggering recursive sync for linked item ${linkedId} on board ${boardConfig.linkedBoardId}`);
					// Trigger sync for linked item, ensuring isRecursiveCall = true to prevent further recursion
					await syncItemColumns(linkedId, boardConfig.linkedBoardId, triggeredBy, timeEntryId, true);
				}
			} else {
				console.log(`[ColumnSync] No linked items found on board ${boardConfig.linkedBoardId} for item ${itemId}`);
			}
		} catch (error) {
			console.error(`[ColumnSync] Error in recursive sync for item ${itemId}:`, error);
		}
	}

	return result;
}

/**
 * Check if sync should happen on finalize for a board
 */
export async function shouldSyncOnFinalize(boardId: string): Promise<boolean> {
	const boardConfig = await getBoardConfig(boardId);
	return (boardConfig?.syncEnabled && boardConfig?.syncOnFinalize) || false;
}

/**
 * Sync an item after a time entry is finalized
 * This is the main entry point called from the finalize time entry flow
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

interface SyncQueueItem {
	itemId: string;
	boardId: string;
	userId: string;
	timeEntryId?: string;
	queuedAt: number;
}

// Import cacheHelper for Redis operations
import { cacheHelper } from "@/lib/redis";

const SYNC_QUEUE_PREFIX = "sync_queue:";
const SYNC_QUEUE_TTL = 15; // seconds
const DEBOUNCE_DELAY = 10000; // 10 seconds in milliseconds
const MAX_QUEUE_SIZE = 1000;
const MAX_CONCURRENT_SYNCS = 10;

let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Queue an item for sync with debouncing
 * Multiple requests for the same item are deduplicated
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
 * Get current queue size
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
 * Flush the sync queue - process all queued items
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
 * Process queue items in batches with concurrency limit
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
 * Sync after time entry update
 * Queues old and new items if item changed
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
 * Sync after time entry delete
 * Queues the item for sync
 */
export async function syncAfterDelete(deletedEntry: any, userId: string): Promise<void> {
	if (!deletedEntry.item_id || !deletedEntry.board_id) {
		console.log(`[ColumnSync] No item/board for deleted entry ${deletedEntry.id}`);
		return;
	}

	console.log(`[ColumnSync] Queueing item ${deletedEntry.item_id} after delete`);
	await queueItemSync(deletedEntry.item_id, deletedEntry.board_id, userId, deletedEntry.id);
}
