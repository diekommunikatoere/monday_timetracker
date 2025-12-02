/**
 * Column Sync Service
 *
 * Handles syncing time tracking data to monday.com board columns.
 * Supports total time, time-by-role breakdown, and remaining budget calculations.
 */

import { ApiClient, ClientError } from "@mondaydotcomorg/api";
import { supabaseAdmin } from "@/lib/supabase/server";
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
export async function getItemTotalTime(itemId: string, userId?: string): Promise<number> {
	const { data, error } = await supabaseAdmin.rpc("get_item_total_time", {
		p_item_id: itemId,
		p_user_id: userId || null,
	});

	if (error) {
		console.error("Error getting item total time:", error);
		return 0;
	}

	return data || 0;
}

/**
 * Get time breakdown by role for an item (using database function)
 */
export async function getItemTimeByRole(itemId: string, userId?: string): Promise<RoleTimeBreakdown[]> {
	const { data, error } = (await supabaseAdmin.rpc("get_item_time_by_role", {
		p_item_id: itemId,
		p_user_id: userId || null,
	})) as { data: GetItemTimeByRoleResult[] | null; error: any };

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

		// Try to parse as number
		const text = columnValue.text || "";
		const value = parseFloat(text.replace(/[^0-9.-]/g, ""));
		return isNaN(value) ? null : value;
	} catch (error) {
		console.error("Error fetching budget from monday.com:", error);
		return null;
	}
}

/**
 * Calculate remaining budget for an item
 */
export async function calculateRemainingBudget(boardId: string, itemId: string, budgetAmount: number, userId?: string): Promise<CalculateRemainingBudgetResult | null> {
	const { data, error } = (await supabaseAdmin.rpc("calculate_remaining_budget", {
		p_board_id: boardId,
		p_item_id: itemId,
		p_budget_amount: budgetAmount,
		p_user_id: userId || null,
	})) as { data: CalculateRemainingBudgetResult[] | null; error: any };

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

	let value: string;
	let success = false;
	let error: string | undefined;

	try {
		switch (syncPurpose) {
			case "total_time": {
				const totalSeconds = await getItemTotalTime(itemId);
				value = formatTime(totalSeconds, timeFormat);
				break;
			}

			case "time_by_role": {
				const breakdown = await getItemTimeByRole(itemId);
				if (columnType === "long_text" || includeBreakdown) {
					value = formatTimeByRoleJson(breakdown);
				} else {
					value = formatTimeByRoleText(breakdown);
				}
				break;
			}

			case "remaining_budget": {
				// Get budget from the configured budget column
				let budgetAmount = 0;
				if (boardConfig.budgetColumnId) {
					const budget = await getBudgetFromColumn(boardId, itemId, boardConfig.budgetColumnId);
					budgetAmount = budget || 0;
				}

				const budgetResult = await calculateRemainingBudget(boardId, itemId, budgetAmount);
				if (budgetResult) {
					value = budgetResult.remaining_budget.toFixed(2);
				} else {
					value = "0.00";
				}
				break;
			}

			default:
				throw new Error(`Unknown sync purpose: ${syncPurpose}`);
		}

		// Update the column in monday.com
		const updateResult = await updateColumnValue(boardId, itemId, columnId, value, columnType);
		success = updateResult.success;
		error = updateResult.error;

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
export async function syncItemColumns(itemId: string, boardId: string, triggeredBy?: string, timeEntryId?: string): Promise<ItemSyncResult> {
	const results: SyncResult[] = [];

	// Get board config
	const boardConfig = await getBoardConfig(boardId);
	if (!boardConfig || !boardConfig.syncEnabled) {
		return {
			itemId,
			boardId,
			results: [],
			overallSuccess: true, // No sync needed, so technically successful
		};
	}

	// Get column mappings
	const columnMappings = await getColumnMappings(boardId);
	if (columnMappings.length === 0) {
		return {
			itemId,
			boardId,
			results: [],
			overallSuccess: true, // No columns configured, so technically successful
		};
	}

	// Filter mappings based on board config settings
	const enabledMappings = columnMappings.filter((mapping) => {
		switch (mapping.syncPurpose) {
			case "total_time":
				return boardConfig.syncTotalTime;
			case "time_by_role":
				return boardConfig.syncTimeByRole;
			case "remaining_budget":
				return boardConfig.syncRemainingBudget;
			default:
				return true;
		}
	});

	// Sync each column
	for (const mapping of enabledMappings) {
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
				failedColumns.map((f) => ({ column: f.columnId, error: f.error }))
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
