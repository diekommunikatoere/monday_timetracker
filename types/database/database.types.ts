/**
 * Custom Database Type Extensions
 *
 * This file contains custom type definitions that extend the auto-generated
 * Supabase types from database.ts. These types are safe from regeneration.
 *
 * Categories:
 * - Table convenience aliases for common operations
 * - RPC function result types
 * - Business logic enums and constants
 *
 * DO NOT add these types to database.ts as they will be overwritten
 * when running `npm run db:types`
 */

import type { Database } from "./database";

// ============================================
// Table Convenience Type Aliases
// ============================================
// These provide shorter, more convenient names for common table operations

export type BoardConfig = Database["public"]["Tables"]["board_config"]["Row"];
export type BoardConfigInsert = Database["public"]["Tables"]["board_config"]["Insert"];
export type BoardConfigUpdate = Database["public"]["Tables"]["board_config"]["Update"];

export type BoardRoleOverride = Database["public"]["Tables"]["board_role_override"]["Row"];
export type BoardRoleOverrideInsert = Database["public"]["Tables"]["board_role_override"]["Insert"];
export type BoardRoleOverrideUpdate = Database["public"]["Tables"]["board_role_override"]["Update"];

export type ColumnSyncConfig = Database["public"]["Tables"]["column_sync_config"]["Row"];
export type ColumnSyncConfigInsert = Database["public"]["Tables"]["column_sync_config"]["Insert"];
export type ColumnSyncConfigUpdate = Database["public"]["Tables"]["column_sync_config"]["Update"];

export type SyncLog = Database["public"]["Tables"]["sync_log"]["Row"];
export type SyncLogInsert = Database["public"]["Tables"]["sync_log"]["Insert"];
export type SyncLogUpdate = Database["public"]["Tables"]["sync_log"]["Update"];

export type Role = Database["public"]["Tables"]["role"]["Row"];
export type RoleInsert = Database["public"]["Tables"]["role"]["Insert"];
export type RoleUpdate = Database["public"]["Tables"]["role"]["Update"];

export type TimerSession = Database["public"]["Tables"]["timer_session"]["Row"];
export type TimerSessionInsert = Database["public"]["Tables"]["timer_session"]["Insert"];
export type TimerSessionUpdate = Database["public"]["Tables"]["timer_session"]["Update"];

export type MondayGroup = Database["public"]["Tables"]["monday_group"]["Row"];
export type MondayGroupInsert = Database["public"]["Tables"]["monday_group"]["Insert"];
export type MondayGroupUpdate = Database["public"]["Tables"]["monday_group"]["Update"];

export type MondayWebhook = Database["public"]["Tables"]["monday_webhook"]["Row"];
export type MondayWebhookInsert = Database["public"]["Tables"]["monday_webhook"]["Insert"];
export type MondayWebhookUpdate = Database["public"]["Tables"]["monday_webhook"]["Update"];

// ============================================
// RPC Function Result Types
// ============================================
// Type definitions for database function return values

/**
 * Result type for get_item_time_by_role RPC function
 * Returns time breakdown by role for a specific item
 */
export interface GetItemTimeByRoleResult {
	role_id: string;
	role_name: string;
	total_seconds: number;
	entry_count: number;
}

/**
 * Result type for calculate_remaining_budget RPC function
 * Returns budget calculations for an item
 */
export interface CalculateRemainingBudgetResult {
	budget_amount: number;
	total_cost: number;
	remaining_budget: number;
	utilization_percent: number;
}

/**
 * Result type for get_current_elapsed_time RPC function
 * Returns the current calculated elapsed time for a session
 */
export interface GetCurrentElapsedTimeResult {
	elapsed_time_ms: number;
	server_time: string;
	error?: string;
}

/**
 * Result type for get_timer_session_with_elapsed RPC function
 * Returns current session details with server-calculated elapsed time
 */
export interface GetTimerSessionWithElapsedResult {
	session: {
		id: string;
		user_id: string;
		draft_id: string;
		start_time: string;
		elapsed_time: number;
		is_paused: boolean;
		created_at: string;
		time_entry: {
			id: string;
			comment: string | null;
		} | null;
	} | null;
	calculated_elapsed_time_ms: number;
	server_time: string;
}

/**
 * Result type for finalize_segment RPC function
 * Returns the final elapsed time and the duration added in the last segment
 */
export interface FinalizeSegmentResult {
	elapsed_time_ms: number;
	duration_added_ms: number;
}

// ============================================
// Business Logic Enums & Constants
// ============================================
// Type-safe enums for business logic and validation

/**
 * Sync purpose defines what type of data is being synced to monday.com columns
 */
export type SyncPurpose = "total_time" | "time_by_role" | "remaining_budget" | "budget_used";

/**
 * Time format options for displaying time in monday.com columns
 */
export type TimeFormat = "hours" | "seconds" | "hh:mm";

/**
 * Valid monday.com column types that can be used for sync operations
 */
export type SyncColumnType = "numbers" | "text" | "long_text" | "time_tracking";

/**
 * Valid monday.com column types that can contain budget information
 */
export type BudgetColumnType = "numbers" | "formula" | "mirror";
