/**
 * Custom Database Type Extensions
 *
 * Hand-written types that extend the auto-generated Supabase types in
 * [database.ts](./database.ts). Everything here is **safe from regeneration** —
 * `database.ts` gets overwritten when the schema is regenerated, this file does not.
 *
 * Categories:
 * - Table convenience aliases for common operations
 * - RPC function result types (shape the `Json` that RPCs return)
 * - Business logic enums and constants
 *
 * Add new custom types HERE, never to `database.ts`. (Note: there is no
 * `npm run db:types` script despite older comments — `database.ts` is regenerated
 * manually via the Supabase CLI, e.g. `supabase gen types typescript ...`.)
 */

import type { Database } from "./database";

// ============================================
// Table Convenience Type Aliases
// ============================================
// Shorter names for the generated `Database["public"]["Tables"][...]` rows.
// For each table: the bare alias is the `Row` (read shape); `*Insert` is the
// write shape (optional defaults/PK) and `*Update` is the partial patch shape —
// these mirror Supabase's Row/Insert/Update triad. Use Insert/Update when calling
// `.insert()` / `.update()`, the bare alias for everything you read back.

/** Per-board sync settings: which budget column to read, and which sync toggles are on. One row per tracked board (`board_config.board_id` → `monday_board`). */
export type BoardConfig = Database["public"]["Tables"]["board_config"]["Row"];
export type BoardConfigInsert = Database["public"]["Tables"]["board_config"]["Insert"];
export type BoardConfigUpdate = Database["public"]["Tables"]["board_config"]["Update"];

/** Per-board override of a role's `hourly_rate`. Lets one board bill a role differently from the global `role.hourly_rate`; resolved by the `get_effective_hourly_rate` RPC. */
export type BoardRoleOverride = Database["public"]["Tables"]["board_role_override"]["Row"];
export type BoardRoleOverrideInsert = Database["public"]["Tables"]["board_role_override"]["Insert"];
export type BoardRoleOverrideUpdate = Database["public"]["Tables"]["board_role_override"]["Update"];

/** A single monday column write-back target: which column, what to write (`sync_purpose`), and how to format it (`time_format`). Drives `lib/columnSync.ts`. */
export type ColumnSyncConfig = Database["public"]["Tables"]["column_sync_config"]["Row"];
export type ColumnSyncConfigInsert = Database["public"]["Tables"]["column_sync_config"]["Insert"];
export type ColumnSyncConfigUpdate = Database["public"]["Tables"]["column_sync_config"]["Update"];

/** Audit trail of column write-backs — one row per attempt, with `success`/`error_message`. Written by `logSyncOperation` in `lib/columnSync.ts`. */
export type SyncLog = Database["public"]["Tables"]["sync_log"]["Row"];
export type SyncLogInsert = Database["public"]["Tables"]["sync_log"]["Insert"];
export type SyncLogUpdate = Database["public"]["Tables"]["sync_log"]["Update"];

/** A billing role (e.g. "Developer", "Designer") with a global `hourly_rate`. The source of truth a `time_entry` points at via `role_id`. */
export type Role = Database["public"]["Tables"]["role"]["Row"];
export type RoleInsert = Database["public"]["Tables"]["role"]["Insert"];
export type RoleUpdate = Database["public"]["Tables"]["role"]["Update"];

/** Local mirror of a monday group, kept in sync by the webhook handler. `sync_enabled` gates whether items in the group sync time back. */
export type MondayGroup = Database["public"]["Tables"]["monday_group"]["Row"];
export type MondayGroupInsert = Database["public"]["Tables"]["monday_group"]["Insert"];
export type MondayGroupUpdate = Database["public"]["Tables"]["monday_group"]["Update"];

/** A monday webhook registration this app owns for a board. Reconciled by the `sync-boards` cron. */
export type MondayWebhook = Database["public"]["Tables"]["monday_webhook"]["Row"];
export type MondayWebhookInsert = Database["public"]["Tables"]["monday_webhook"]["Insert"];
export type MondayWebhookUpdate = Database["public"]["Tables"]["monday_webhook"]["Update"];

// ============================================
// RPC Function Result Types
// ============================================
// The generated `Functions` signatures in database.ts type several RPCs as
// returning `Json`. These interfaces give that `Json` a shape — callers cast
// with `as unknown as <Result>` (see app/api/timer/* and lib/columnSync.ts).
// WATCH THE UNITS: time-by-role/budget RPCs report **seconds**, while the timer
// RPCs report **milliseconds** (the `_ms` suffix).

/**
 * One row from `get_item_time_by_role` — time tracked on an item, grouped by role.
 *
 * @property total_seconds - Summed duration for the role, in **seconds**.
 * @property entry_count   - Number of time entries contributing to the total.
 */
export interface GetItemTimeByRoleResult {
	role_id: string;
	role_name: string;
	total_seconds: number;
	entry_count: number;
}

/**
 * Result of `calculate_remaining_budget` — budget math for an item.
 *
 * @property budget_amount       - The configured budget (currency units).
 * @property total_cost          - Tracked time × effective hourly rates (currency units).
 * @property remaining_budget    - `budget_amount - total_cost`.
 * @property utilization_percent - `total_cost / budget_amount` as a percentage (0–100+).
 */
export interface CalculateRemainingBudgetResult {
	budget_amount: number;
	total_cost: number;
	remaining_budget: number;
	utilization_percent: number;
}

/**
 * Result of `get_current_elapsed_time` — live elapsed time for a session.
 *
 * @property elapsed_time_ms - Elapsed time in **milliseconds**.
 * @property server_time     - DB clock at calculation (ISO 8601); the client syncs against this.
 * @property error           - Present only when the session can't be read.
 */
export interface GetCurrentElapsedTimeResult {
	elapsed_time_ms: number;
	server_time: string;
	error?: string;
}

/**
 * Result of `get_timer_session_with_elapsed` — the active session plus a
 * server-computed elapsed time, in one round-trip.
 *
 * @property session                  - The session (with its draft `time_entry`), or null if none active.
 * @property calculated_elapsed_time_ms - Server-side elapsed time in **milliseconds**.
 * @property server_time              - DB clock at calculation (ISO 8601).
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
 * Result of `finalize_segment` (called on pause/finalize) — closes the open
 * `timer_segment` and reports the totals.
 *
 * @property elapsed_time_ms   - Cumulative session elapsed time in **milliseconds**.
 * @property duration_added_ms - Duration of the segment just closed, in **milliseconds**.
 */
export interface FinalizeSegmentResult {
	elapsed_time_ms: number;
	duration_added_ms: number;
}

// ============================================
// Business Logic Enums & Constants
// ============================================
// Type-safe string unions for the column-sync config. These are stored as plain
// `string` columns in the DB, so reads from `column_sync_config` cast to them
// (e.g. `config.sync_purpose as SyncPurpose` in lib/columnSync.ts).

/**
 * What a configured monday column gets populated with on sync.
 *
 * - `total_time`       — total tracked time on the item.
 * - `time_by_role`     — per-role breakdown (text/long-text).
 * - `remaining_budget` — `budget − cost`.
 * - `budget_used`      — cost consumed so far.
 *
 * Column-type compatibility for each purpose lives in `COMPATIBLE_COLUMN_TYPES`
 * (`lib/monday/utils.ts`); `isTimePurpose()` flags the two time-based ones.
 */
export type SyncPurpose = "total_time" | "time_by_role" | "remaining_budget" | "budget_used";

/**
 * How a time value is rendered into a monday column (see `formatTimeValue` in
 * `lib/monday/columnSync.ts`).
 *
 * - `hours`   — decimal hours, e.g. `2.5` for 2h 30m.
 * - `seconds` — raw seconds.
 * - `hh:mm`   — zero-padded clock string, e.g. `"02:30"`.
 */
export type TimeFormat = "hours" | "seconds" | "hh:mm";

/**
 * monday column types this app can **write** sync values into. Note `time_tracking`
 * is read-only via the monday API, so it's a valid source but not a write target
 * (it's absent from `COMPATIBLE_COLUMN_TYPES`).
 */
export type SyncColumnType = "numbers" | "text" | "long_text" | "time_tracking";

/**
 * monday column types a **budget amount can be read from** when computing
 * remaining budget (numeric, formula, or a mirror of one).
 */
export type BudgetColumnType = "numbers" | "formula" | "mirror";
