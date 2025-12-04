/**
 * Type System Barrel Exports
 *
 * Convenient re-exports for commonly used types across the application.
 * This simplifies imports and provides a single source of truth.
 *
 * Usage:
 *   import { BoardConfig, Database } from "@/types";
 *
 * Instead of:
 *   import { BoardConfig } from "@/types/database.types";
 *   import { Database } from "@/types/database";
 */

// Re-export core Supabase types
export type { Database, Json } from "./database";

// Re-export all custom type extensions
export type {
	// Table types
	BoardConfig,
	BoardConfigInsert,
	BoardConfigUpdate,
	BoardRoleOverride,
	BoardRoleOverrideInsert,
	BoardRoleOverrideUpdate,
	ColumnSyncConfig,
	ColumnSyncConfigInsert,
	ColumnSyncConfigUpdate,
	SyncLog,
	SyncLogInsert,
	SyncLogUpdate,
	Role,
	RoleInsert,
	RoleUpdate,
	// RPC result types
	GetItemTimeByRoleResult,
	CalculateRemainingBudgetResult,
	// Business logic enums
	SyncPurpose,
	TimeFormat,
	SyncColumnType,
	BudgetColumnType,
} from "./database.types";
