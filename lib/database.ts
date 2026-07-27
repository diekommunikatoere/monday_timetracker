// lib/database.ts
// Core data-access layer for time entries, timer segments, and the
// monday.com dimension tables (monday_board, monday_item).
//
// Architecture notes:
//   - All DB access uses `supabaseAdmin` (service-role key, RLS-bypassing).
//     Never import this module into client code.
//   - Time math and timer lifecycle (start, pause, resume, park, finalize, reset)
//     execute in the atomic `timer_*` Postgres RPC functions defined in
//     `025_timer_functions.sql`. TypeScript only drives the control flow.
//   - Time entries are cached in Redis under the `time_entry:` prefix with a
//     300 s TTL. Every write must invalidate via `cacheHelper.clearPattern("time_entry:*")`.
//   - Soft-delete is a real workflow: `softDeleteTimeEntry` marks a row with
//     `deleted_at` and writes a `hard_delete:<id>` key to Redis (5 s TTL).
//     The cleanup cron drains that queue. Undo cancels the Redis key within
//     the 5 s window.

import { SELF_EDITABLE_TIME_ENTRY_FIELDS } from "@/lib/permissions";
import { cacheHelper } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { TimeEntry as FrontendTimeEntry } from "@/types/time-entry";

import { fetchAllWithRange, fetchAllWithKeyset } from "./supabase/pagination";
import { roundDuration } from "./utils";

/** Raw `time_entry` table row from the generated DB types. */
type TimeEntry = Database["public"]["Tables"]["time_entry"]["Row"];
/** {@link FrontendTimeEntry} alias — the flattened, display-ready shape returned by read RPCs. */
type TimeEntryWithRole = FrontendTimeEntry;
/** Insert shape for `time_entry`. */
type TimeEntryInsert = Database["public"]["Tables"]["time_entry"]["Insert"];
/** Update shape for `time_entry`. */
type TimeEntryUpdate = Database["public"]["Tables"]["time_entry"]["Update"];
/** Insert shape for `timer_segment`. */
type TimerSegmentInsert = Database["public"]["Tables"]["timer_segment"]["Insert"];

// ============================================
// Dimension Management Helpers
// ============================================

/**
 * Human-readable display names and parent-item identifiers that travel with
 * insert/update payloads but are **not** columns on `time_entry`.
 *
 * These fields are stripped from the DB payload before any write (see
 * {@link insertTimeEntry} / {@link updateTimeEntry}) and used only to keep the
 * dimension tables (`monday_board`, `monday_item`) up-to-date. Passing them
 * through the write functions avoids a separate lookup round trip.
 *
 * @property board_name      - Display name for the `monday_board` dimension upsert.
 * @property item_name       - Display name for the `monday_item` dimension upsert.
 * @property parent_item_id  - Parent item ID for subitems; used to resolve the correct board.
 * @property parent_item_name - Display name of the parent item for the `monday_item` upsert.
 * @property role_name       - Human-readable role label (not stored; currently unused in writes).
 * @property task_name       - Free-text task label (not stored as a separate column).
 */
export interface DimensionMetadata {
	board_name?: string;
	item_name?: string;
	parent_item_id?: string | null;
	parent_item_name?: string;
	role_name?: string;
	task_name?: string;
}

/**
 * Upsert a monday board into the `monday_board` dimension table.
 *
 * Only call this for **top-level** (non-subitems) boards. Subitems boards must
 * never be registered here because they would then be fetched as tracked boards
 * by the sync logic. The `insertTimeEntry` / `updateTimeEntry` callers enforce
 * this guard by checking `parent_item_id` before calling.
 *
 * @param id          - The monday board ID string.
 * @param name        - Display name for the board.
 * @param workspaceId - Optional monday workspace ID; omitted keys are left untouched on conflict.
 */
export async function upsertMondayBoard(id: string, name: string, workspaceId?: string | null) {
	if (!id || !name) return;

	const payload: { id: string; name: string; updated_at: string; workspace_id?: string | null } = { id, name, updated_at: new Date().toISOString() };
	if (workspaceId !== undefined) {
		payload.workspace_id = workspaceId;
	}

	const { error } = await supabaseAdmin.from("monday_board").upsert(payload, { onConflict: "id" });

	if (error) {
		console.error(`Error upserting monday_board ${id}:`, error);
	}
}

/**
 * Fetch the task list for a board from the local DB mirror.
 *
 * Returns items and subitems from the `view_monday_tasks` view, filtered to:
 * - Groups with `sync_enabled = true` (disabled groups are excluded).
 * - `is_active = true` items (soft-deleted / archived items are excluded).
 *
 * Uses a **two-step approach** to avoid a Supabase PostgREST FK join issue:
 * 1. Fetch all `monday_group` rows for the board, ordered by `position`.
 * 2. Paginate `view_monday_tasks` with keyset pagination (1 000 rows/batch)
 *    then filter in memory by `board_id`, `is_active`, and `group_id`.
 *
 * Result shape is formatted for the frontend task-picker, including nested
 * `group` and `parent_item` objects.
 *
 * @param boardId - The monday board ID to query.
 * @returns Array of task objects with `id`, `name`, `group`, and `parent_item`.
 */
export async function getTasksFromDB(boardId: string) {
	console.log(`[getTasksFromDB] Fetching tasks for board ${boardId}`);
	// Step 1: Get all synced groups for this board, ordered by their board position
	const { data: allGroups, error: groupsError } = await supabaseAdmin.from("monday_group").select("id, title, position, color, sync_enabled").eq("board_id", boardId).order("position", { ascending: true });

	if (groupsError) {
		console.error(`Error fetching groups for board ${boardId}:`, groupsError);
		throw groupsError;
	}

	const syncedGroups = allGroups?.filter((g) => g.sync_enabled) || [];
	console.log(`[getTasksFromDB] Found ${allGroups?.length || 0} groups total, ${syncedGroups.length} are sync_enabled`);

	if (syncedGroups.length === 0 && (allGroups?.length || 0) > 0) {
		console.warn(`[getTasksFromDB] All groups are currently disabled for sync on board ${boardId}`);
	}

	if (syncedGroups.length === 0) {
		// No synced groups means no tasks
		return [];
	}

	const syncedGroupIds = syncedGroups.map((g) => g.id);
	const groupInfoMap = new Map(syncedGroups.map((g) => [g.id, { title: g.title, position: g.position, color: g.color }]));

	// Step 2: Get all active items (parents and subitems) from synced groups using the view
	// First, let's see how many items are in the board total vs synced
	const { count: totalBoardItems } = await supabaseAdmin.from("view_monday_tasks").select("*", { count: "exact", head: true }).eq("board_id", boardId);
	const { count: activeBoardItems } = await supabaseAdmin.from("view_monday_tasks").select("*", { count: "exact", head: true }).eq("board_id", boardId).eq("is_active", true);

	console.log(`[getTasksFromDB] Board ${boardId} total items (from view): ${totalBoardItems}, active items: ${activeBoardItems}`);

	// Step 3: Fetch the items with group filtering using pagination for large boards
	// Use keyset pagination on the unique 'id' column (non-unique cursors like
	// 'name' skip rows at batch boundaries) and scope to the board server-side.
	// Note: We still select is_active and group_id for in-memory filtering.
	const result = await fetchAllWithKeyset(supabaseAdmin, "view_monday_tasks", "id", "id, name, parent_item_id, parent_item_name, group_id, board_id, is_active", { batchSize: 1000, eq: { board_id: boardId } });

	if (!result.success) {
		console.error(`Error fetching items from DB for board ${boardId}:`, result.error);
		throw new Error(result.error || "Failed to fetch tasks");
	}

	// Apply remaining filters in memory (is_active, group_id); board_id is scoped server-side
	type ViewMondayTask = {
		board_id: string | null;
		group_id: string | null;
		id: string | null;
		is_active: boolean | null;
		name: string | null;
		parent_item_id: string | null;
		parent_item_name: string | null;
		updated_at: string | null;
	};

	const items = result.data.filter((item: ViewMondayTask) => item.is_active === true && syncedGroupIds.includes(item.group_id!)) as ViewMondayTask[];

	if (items.length === 0) {
		console.log(`[getTasksFromDB] No items found matching sync criteria for board ${boardId}`);
		return [];
	}

	console.log(`[getTasksFromDB] Fetched ${items.length} items for board ${boardId} from synced groups (${result.batches} batches)`);

	// Format for the frontend
	return items.map((item) => ({
		id: item.id,
		name: item.name,
		group: {
			id: item.group_id,
			title: groupInfoMap.get(item.group_id)?.title || "Unknown Group",
			color: groupInfoMap.get(item.group_id)?.color || null,
			position: groupInfoMap.get(item.group_id)?.position || null,
		},
		parent_item: item.parent_item_id
			? {
					id: item.parent_item_id,
					name: item.parent_item_name || "Parent Item",
				}
			: null,
	}));
}

/**
 * Upsert a monday item (task or subitem) into the `monday_item` dimension table.
 *
 * **Optimisation**: `group_id` is only written when supplied — passing `null`
 * here will NOT clear an existing `group_id`. This prevents manual time entries
 * (which carry no group info) from wiping the group association set during a
 * full board sync.
 *
 * For subitems, pass the parent's tracked `boardId` (not the subitems board).
 * The subitems board must never appear in `monday_board`; see {@link upsertMondayBoard}.
 *
 * @param id           - The monday item ID string.
 * @param name         - Display name of the item.
 * @param boardId      - The tracked (parent) board ID this item belongs to.
 * @param parentItemId - Parent item ID if this is a subitem; omit for top-level items.
 * @param groupId      - Group ID within the board; omitted rather than nulled when absent.
 */
export async function upsertMondayItem(id: string, name: string, boardId: string, parentItemId?: string | null, groupId?: string | null) {
	if (!id || !name || !boardId) return;

	// Optimization: Don't overwrite group_id with null if it's already set
	// This prevents manual time entries (which don't have group info) from clearing sync groups
	const upsertPayload: any = {
		id,
		name,
		board_id: boardId,
		parent_item_id: parentItemId || null,
		is_active: true,
		updated_at: new Date().toISOString(),
	};

	if (groupId) {
		upsertPayload.group_id = groupId;
	}

	const { error } = await supabaseAdmin.from("monday_item").upsert(upsertPayload, { onConflict: "id" });

	if (error) {
		console.error(`[${new Date().toISOString()}] Error upserting monday_item ${id} (Board: ${boardId}):`, {
			message: error.message,
			details: error.details,
			hint: error.hint,
			code: error.code,
		});
	}
}

/**
 * Input shape for a single item in a {@link upsertMondayItemsBatch} call.
 *
 * @property id           - The monday item ID string.
 * @property name         - Display name of the item.
 * @property boardId      - The tracked (parent) board ID this item belongs to.
 * @property parentItemId - Parent item ID for subitems; omit for top-level items.
 * @property groupId      - Group ID within the board; written as-is (including `null`).
 */
interface MondayItemData {
	id: string;
	name: string;
	boardId: string;
	parentItemId?: string | null;
	groupId?: string | null;
}

/**
 * Batch upsert multiple monday items into the `monday_item` dimension table.
 *
 * Prefer this over calling {@link upsertMondayItem} in a loop during board
 * syncs. Processes items in sequential batches of 100 (Supabase's recommended
 * limit) to avoid exhausting the connection pool. Individual batch failures are
 * logged but do not abort subsequent batches.
 *
 * Unlike the single-item {@link upsertMondayItem}, this function always writes
 * `group_id` (including `null`) because it is used during full syncs where
 * group membership is known for all items.
 *
 * @param items - Array of {@link MondayItemData} objects to upsert.
 */
export async function upsertMondayItemsBatch(items: MondayItemData[]) {
	if (items.length === 0) return;

	const BATCH_SIZE = 100; // Supabase recommended batch size
	const batches: MondayItemData[][] = [];

	// Split items into batches
	for (let i = 0; i < items.length; i += BATCH_SIZE) {
		batches.push(items.slice(i, i + BATCH_SIZE));
	}

	console.log(`[upsertMondayItemsBatch] Processing ${items.length} items in ${batches.length} batches`);

	// Process batches sequentially to avoid overwhelming the connection pool
	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i];
		const upsertData = batch.map((item) => ({
			id: item.id,
			name: item.name,
			board_id: item.boardId,
			parent_item_id: item.parentItemId || null,
			group_id: item.groupId || null,
			updated_at: new Date().toISOString(),
		}));

		const { error } = await supabaseAdmin.from("monday_item").upsert(upsertData, { onConflict: "id" });

		if (error) {
			console.error(`[upsertMondayItemsBatch] Error in batch ${i + 1}/${batches.length}:`, {
				message: error.message,
				details: error.details,
				hint: error.hint,
				code: error.code,
			});
			// Continue with other batches even if one fails
		}
	}

	console.log(`[upsertMondayItemsBatch] Completed ${items.length} items`);
}

/** Cache TTL for time-entry reads, in **seconds** (5 minutes). */
const CACHE_TTL = 300; // 5 minutes
/** Redis key prefix for all time-entry cache entries. */
const CACHE_PREFIX = "time_entry:";

/**
 * Fetch every `time_entry` row (all users, all boards).
 *
 * Results are cached under `time_entry:all` for {@link CACHE_TTL} seconds.
 * Uses keyset pagination on `created_at` with 1 000-row batches to work around
 * Supabase's per-query row cap. Returns a flat array of raw DB rows
 * (not the display-ready {@link FrontendTimeEntry} shape).
 *
 * **Admin-only** — do not expose this to non-admin routes; it returns all users'
 * data without any user-id filtering.
 *
 * @returns All `time_entry` rows, sorted by `created_at` ascending.
 */
export async function getAllTimeEntries(): Promise<TimeEntry[]> {
	const cacheKey = `${CACHE_PREFIX}all`;

	// Try cache first
	const cached = await cacheHelper.get<TimeEntry[]>(cacheKey);
	if (cached) {
		return cached;
	}

	// Fetch from database using keyset pagination for better performance with large datasets
	const result = await fetchAllWithKeyset(supabaseAdmin, "time_entry", "created_at", "*", { batchSize: 1000 });

	if (!result.success) {
		console.error("Error fetching time entries:", result.error);
		throw new Error(result.error || "Failed to fetch time entries");
	}

	// Cache the result
	await cacheHelper.set(cacheKey, result.data, CACHE_TTL);

	return result.data;
}

/**
 * Fetch a single `time_entry` row by its UUID.
 *
 * Results are cached under `time_entry:<id>` for {@link CACHE_TTL} seconds.
 * Returns the raw DB row (not the display-ready {@link FrontendTimeEntry} shape).
 * Returns `null` (rather than throwing) when the entry is not found.
 *
 * @param id - The `time_entry.id` UUID to fetch.
 * @returns The raw `time_entry` row, or `null` if not found.
 */
export async function getTimeEntryById(id: string): Promise<TimeEntry | null> {
	const cacheKey = `${CACHE_PREFIX}${id}`;

	// Try cache first
	const cached = await cacheHelper.get<TimeEntry>(cacheKey);
	if (cached) {
		return cached;
	}

	// Fetch from database
	const { data, error } = await supabaseAdmin.from("time_entry").select("*").eq("id", id).single();

	if (error) {
		console.error(`Error fetching time entry ${id}:`, error);
		return null;
	}

	// Cache the result
	await cacheHelper.set(cacheKey, data, CACHE_TTL);

	return data;
}

/**
 * Fetch all finalized time entries for a specific monday item, across all users.
 *
 * Delegates to the `get_item_time_entries` Postgres RPC, which JOINs dimension
 * tables and returns the flattened {@link FrontendTimeEntry} shape (including
 * `user_name`, `role_name`, etc.) — not raw DB rows.
 *
 * Results are **not** cached here; the caller is responsible for caching if needed.
 *
 * @param itemId    - The monday item ID to filter by.
 * @param boardId   - The board ID the item belongs to.
 * @param startDate - Optional ISO 8601 date string for the lower bound of `start_time`.
 * @param endDate   - Optional ISO 8601 date string for the upper bound of `start_time`.
 * @returns Flattened time entries for the item, sorted by the RPC's default order.
 */
export async function getItemTimeEntries(itemId: string, boardId: string, startDate?: string, endDate?: string): Promise<FrontendTimeEntry[]> {
	const { data, error } = await supabaseAdmin.rpc("get_item_time_entries" as any, {
		p_item_id: itemId,
		p_board_id: boardId,
		p_start_date: startDate || null,
		p_end_date: endDate || null,
	});

	if (error) {
		console.error(`Error fetching time entries for item ${itemId}:`, error);
		throw error;
	}

	return data as unknown as FrontendTimeEntry[];
}

/**
 * Insert a new (non-draft) `time_entry` row and keep dimension tables in sync.
 *
 * Before inserting, this function:
 * 1. Strips {@link DimensionMetadata} fields (not columns on `time_entry`).
 * 2. For subitems (`parent_item_id` present): resolves the correct tracked
 *    board from `monday_item.board_id` and overwrites `board_id` on the payload.
 *    This prevents the subitems board from being registered as a tracked board.
 * 3. Upserts `monday_board` (top-level items only) and `monday_item` dimension rows.
 * 4. Rounds `duration` via `roundDuration` before writing.
 * 5. Invalidates all `time_entry:*` cache entries.
 *
 * @param entry  - Insert payload with optional {@link DimensionMetadata} fields merged in.
 * @param userId - Internal `user_profiles.id`; must match `entry.user_id`.
 * @returns The inserted raw `time_entry` row.
 */
export async function insertTimeEntry(entry: TimeEntryInsert & DimensionMetadata, userId: string): Promise<TimeEntry> {
	// Make sure user_id is provided
	if (!entry.user_id) {
		throw new Error("user_id is required to create a time entry");
	}

	// Extract dimension metadata and other non-database fields
	const { board_name, item_name, parent_item_name, role_name, task_name, parent_item_id, ...cleanEntry } = entry;

	// For subitems, persist against the parent's board. Resolve this BEFORE any
	// monday_board upsert so a subitems board is never registered as a tracked
	// board (which would let it be fetched/flattened as a normal board).
	if (parent_item_id) {
		const { data: parentItem } = await supabaseAdmin.from("monday_item").select("board_id").eq("id", parent_item_id).single();
		if (parentItem?.board_id) {
			cleanEntry.board_id = parentItem.board_id;
		}
	}

	// UPSERT the board dimension only for top-level items. For a subitem, board_name
	// describes its (untracked) subitems board, and its parent board is already a
	// tracked board — registering the subitems board here is what corrupts sync.
	if (cleanEntry.board_id && board_name && !parent_item_id) {
		await upsertMondayBoard(cleanEntry.board_id, board_name);
	}

	if (cleanEntry.item_id && item_name) {
		await upsertMondayItem(cleanEntry.item_id, item_name, cleanEntry.board_id!, parent_item_id);
	}

	if (parent_item_id && parent_item_name) {
		await upsertMondayItem(parent_item_id, parent_item_name, cleanEntry.board_id!);
	}

	// Apply rounding logic
	if (cleanEntry.duration !== undefined && cleanEntry.duration !== null) {
		cleanEntry.duration = roundDuration(cleanEntry.duration);
	}

	const { data, error } = await supabaseAdmin.from("time_entry").insert(cleanEntry).select().single();

	if (error) {
		console.error("Error inserting time entry:", error);
		throw error;
	}

	// Invalidate cache
	await cacheHelper.clearPattern(`${CACHE_PREFIX}*`);
	await cacheHelper.del(`${CACHE_PREFIX}all`);

	return data;
}
/**
 * Permanently delete a `time_entry` row and evict its cache entries.
 *
 * This is an immediate hard delete — there is no undo window. For the
 * reversible soft-delete + undo workflow, use {@link softDeleteTimeEntry} instead.
 * Ownership is **not** verified here; the caller must check `user_id` if needed.
 *
 * @param id     - The `time_entry.id` UUID to delete.
 * @param userId - Unused in the current implementation (kept for API symmetry).
 */
export async function deleteTimeEntry(id: string, userId: string): Promise<void> {
	const { error } = await supabaseAdmin.from("time_entry").delete().eq("id", id);

	if (error) {
		console.error(`Error deleting time entry ${id}:`, error);
		throw error;
	}

	// Invalidate cache
	await cacheHelper.del(`${CACHE_PREFIX}${id}`);
	await cacheHelper.clearPattern(`${CACHE_PREFIX}*`);
}

/**
 * Fetch **all** of a single user's time entries in display-ready shape, for
 * client-side search/filter/pagination (see `stores/timeEntriesStore.ts` and
 * `components/dashboard/hooks/useFilteredTimeEntries.ts`).
 *
 * Delegates to the `get_user_time_entries` Postgres RPC, which JOINs dimension
 * tables and returns the flattened {@link FrontendTimeEntry} shape (with
 * `board_name`, `item_name`, `role_name`, etc.) — not raw DB rows. The RPC caps
 * a single call at 1 000 rows (the PostgREST/RPC limit), so this function loops
 * over `p_offset` — using the `total_count` column from the first batch to know
 * when to stop — and concatenates every batch. Results are **not** cached here
 * (per-user keys aren't worth caching; the whole set is invalidated on every
 * write anyway).
 *
 * The RPC excludes the live running timer server-side (`timer_state <>
 * 'running'`) but still includes other non-finalized entries (paused/parked
 * drafts) — the entries table uses `timer_state` to render draft-row styling.
 * Each row also carries a `total_count` column (identical on every row via
 * `COUNT(*) OVER()`); it's only used internally to drive the loop and is
 * otherwise ignored by the {@link TimeEntry} type.
 *
 * @param userId - Internal `user_profiles.id` UUID; passed as `p_user_id` to the RPC.
 * @returns All of the user's entries (newest first, per the RPC's `ORDER BY start_time DESC`).
 */
export async function getAllUserTimeEntries(userId: string): Promise<{ entries: TimeEntryWithRole[] }> {
	const BATCH_SIZE = 1000; // PostgREST/RPC row cap per call
	const rows: any[] = [];
	let offset = 0;
	let total = Infinity;

	while (rows.length < total) {
		const { data, error } = await supabaseAdmin.rpc("get_user_time_entries", {
			p_user_id: userId,
			p_limit: BATCH_SIZE,
			p_offset: offset,
		} as any);

		if (error) {
			console.error("Error fetching user time entries:", error);
			throw error;
		}

		const batch = (data ?? []) as any[];
		if (batch.length === 0) break;

		rows.push(...batch);
		total = batch[0]?.total_count ?? rows.length;
		offset += batch.length;

		if (batch.length < BATCH_SIZE) break; // last batch was short — no more rows
	}

	return { entries: rows as TimeEntryWithRole[] };
}

// =====================================
// Time Entry Update & Delete Functions
// =====================================

/**
 * Update a `time_entry` row with ownership check and optional optimistic locking.
 *
 * Before writing, this function:
 * 1. Fetches the existing row (cache-first via {@link getTimeEntryById}).
 * 2. Verifies `user_id` ownership (throws 403-equivalent if mismatch).
 * 3. If `expectedUpdatedAt` is provided, compares it to `updated_at` and throws
 *    a `CONFLICT` error (status 409) on mismatch — prevents silent overwrites
 *    when two tabs edit the same entry concurrently.
 * 4. Strips {@link DimensionMetadata} fields and resolves the correct board for subitems
 *    (same guard as {@link insertTimeEntry}: subitems board must never reach `monday_board`).
 * 5. Upserts `monday_board` (top-level items only) and `monday_item` dimension rows.
 * 6. Rounds `duration` via `roundDuration`.
 * 7. Invalidates all `time_entry:*` cache entries.
 *
 * Returns both the old and new rows so callers can compute delta syncs.
 *
 * @param id               - The `time_entry.id` UUID to update.
 * @param updates          - Update payload with optional {@link DimensionMetadata} fields.
 * @param userId           - Internal `user_profiles.id`; must own the entry.
 * @param expectedUpdatedAt - Optional ISO 8601 timestamp for optimistic-lock check.
 * @returns Object with `old` (pre-update row) and `new` (post-update row).
 */
export async function updateTimeEntry(id: string, updates: TimeEntryUpdate & DimensionMetadata, userId: string, expectedUpdatedAt?: string): Promise<{ old: TimeEntry; new: TimeEntry }> {
	// Fetch old entry first
	const oldEntry = await getTimeEntryById(id);
	if (!oldEntry) {
		throw new Error(`Time entry ${id} not found`);
	}

	// Verify ownership
	if (oldEntry.user_id !== userId) {
		throw new Error("Unauthorized to update this time entry");
	}

	// Optimistic locking: check if entry was modified since user loaded it
	if (expectedUpdatedAt && oldEntry.updated_at !== expectedUpdatedAt) {
		const error: any = new Error("Concurrent modification detected");
		error.code = "CONFLICT";
		error.statusCode = 409;
		throw error;
	}

	// Extract dimension metadata and other non-database fields
	const { board_name, item_name, parent_item_name, role_name, task_name, id: _id, parent_item_id, ...cleanUpdates } = updates;

	// For subitems, persist against the parent's board. Resolve this BEFORE any
	// monday_board upsert so a subitems board is never registered as a tracked board.
	// Resolve parentItemId from updates or from the existing monday_item record.
	let resolvedParentItemId = parent_item_id;
	if (!resolvedParentItemId && cleanUpdates.item_id) {
		const { data: itemRecord } = await supabaseAdmin.from("monday_item").select("parent_item_id").eq("id", cleanUpdates.item_id).maybeSingle();
		resolvedParentItemId = itemRecord?.parent_item_id;
	}

	if (resolvedParentItemId) {
		const { data: parentItem } = await supabaseAdmin.from("monday_item").select("board_id").eq("id", resolvedParentItemId).single();
		if (parentItem?.board_id) {
			cleanUpdates.board_id = parentItem.board_id;
		}
	}

	// UPSERT the board dimension only for top-level items. For a subitem, board_name
	// describes its (untracked) subitems board (see insertTimeEntry).
	if (cleanUpdates.board_id && board_name && !resolvedParentItemId) {
		await upsertMondayBoard(cleanUpdates.board_id, board_name);
	}

	// Use board_id from updates or fallback to old entry
	const boardId = cleanUpdates.board_id || oldEntry.board_id;

	if (cleanUpdates.item_id && item_name && boardId) {
		await upsertMondayItem(cleanUpdates.item_id, item_name, boardId, resolvedParentItemId);
	}

	if (resolvedParentItemId && parent_item_name && boardId) {
		await upsertMondayItem(resolvedParentItemId, parent_item_name, boardId);
	}

	// Apply rounding logic
	if (cleanUpdates.duration !== undefined && cleanUpdates.duration !== null) {
		cleanUpdates.duration = roundDuration(cleanUpdates.duration);
	}

	// Whitelist the columns a user may change. cleanUpdates still holds whatever
	// the client sent (minus dimension fields); copying only allowed keys keeps
	// system columns (user_id, timer_state, deleted_*, synced_to_monday, created_at)
	// unreachable from the request body. Runs last so the board/duration fixes above are included.
	const updatePayload: TimeEntryUpdate = {};
	for (const field of SELF_EDITABLE_TIME_ENTRY_FIELDS) {
		if (field in cleanUpdates) (updatePayload as any)[field] = (cleanUpdates as any)[field];
	}

	// Update entry
	const { data, error } = await supabaseAdmin
		.from("time_entry")
		.update({
			...updatePayload,
			updated_at: new Date().toISOString(),
		})
		.eq("id", id)
		.select()
		.single();

	if (error) {
		console.error(`Error updating time entry ${id}:`, error);
		throw error;
	}

	// Invalidate cache
	await cacheHelper.del(`${CACHE_PREFIX}${id}`);
	await cacheHelper.clearPattern(`${CACHE_PREFIX}*`);

	return { old: oldEntry, new: data };
}

/**
 * Mark a `time_entry` as soft-deleted and schedule a deferred hard delete.
 *
 * Sets `deleted_at` and `deleted_by` on the row (reversible within the undo
 * window). Simultaneously:
 * - Writes a `hard_delete:<id>` key to Redis with a **5-second TTL**.
 *   The cleanup cron (`/api/cron/cleanup-soft-deletes`) drains keys where the
 *   TTL has expired, performing the actual `DELETE`.
 * - Generates a base64-encoded undo token (containing `entryId`, `userId`, and
 *   a 5-second expiry timestamp). Pass this token to {@link restoreTimeEntry}
 *   within the window to cancel the delete.
 *
 * The undo token is **not** a signed JWT — it can be forged. Ownership and expiry
 * are enforced again inside {@link restoreTimeEntry}.
 *
 * @param id     - The `time_entry.id` UUID to soft-delete.
 * @param userId - Internal `user_profiles.id`; must own the entry.
 * @returns Object with the soft-deleted `entry` row and the base64 `undoToken`.
 */
export async function softDeleteTimeEntry(id: string, userId: string): Promise<{ entry: TimeEntry; undoToken: string }> {
	const entry = await getTimeEntryById(id);
	if (!entry) {
		throw new Error(`Time entry ${id} not found`);
	}

	if (entry.user_id !== userId) {
		throw new Error("Unauthorized to delete this time entry");
	}

	// Mark as soft-deleted
	const { data, error } = await supabaseAdmin
		.from("time_entry")
		.update({
			deleted_at: new Date().toISOString(),
			deleted_by: userId,
		})
		.eq("id", id)
		.select()
		.single();

	if (error) {
		throw error;
	}

	// Schedule hard delete in Redis (5 second TTL)
	const hardDeleteKey = `hard_delete:${id}`;
	await cacheHelper.set(
		hardDeleteKey,
		JSON.stringify({
			entryId: id,
			userId,
			itemId: data.item_id,
			boardId: data.board_id,
			deletedAt: data.deleted_at,
		}),
		5, // 5 seconds TTL
	);

	// Generate undo token (JWT with 5s expiry)
	const undoToken = Buffer.from(
		JSON.stringify({
			entryId: id,
			userId,
			exp: Date.now() + 5000, // 5 seconds from now
		}),
	).toString("base64");

	// Invalidate cache
	await cacheHelper.del(`${CACHE_PREFIX}${id}`);
	await cacheHelper.clearPattern(`${CACHE_PREFIX}*`);

	return { entry: data, undoToken };
}

/**
 * Restores a soft-deleted time entry, cancelling the scheduled hard delete.
 *
 * Validates `undoToken` (a base64-encoded JSON payload with `entryId`, `userId`, and `exp`)
 * before restoring. The token is **not** a signed JWT — it only prevents accidental misuse,
 * not adversarial forgery; ownership is enforced by the `.eq("user_id", userId)` filter on
 * the update. After restore, the `hard_delete:${id}` Redis key is removed so the cleanup
 * cron does not hard-delete the entry later.
 *
 * @param id        - UUID of the time entry to restore.
 * @param userId    - Internal Supabase `user_profiles.id` — must match the entry's owner.
 * @param undoToken - Base64 token returned by {@link softDeleteTimeEntry}.
 * @returns The restored {@link TimeEntry} row.
 */
export async function restoreTimeEntry(id: string, userId: string, undoToken: string): Promise<TimeEntry> {
	// Verify undo token
	try {
		const decoded = JSON.parse(Buffer.from(undoToken, "base64").toString());
		if (decoded.entryId !== id || decoded.userId !== userId || decoded.exp < Date.now()) {
			throw new Error("Invalid or expired undo token");
		}
	} catch (err) {
		throw new Error("Invalid undo token");
	}

	// Restore entry
	const { data, error } = await supabaseAdmin
		.from("time_entry")
		.update({
			deleted_at: null,
			deleted_by: null,
		})
		.eq("id", id)
		.eq("user_id", userId)
		.select()
		.single();

	if (error) {
		throw error;
	}

	// Cancel scheduled hard delete
	const hardDeleteKey = `hard_delete:${id}`;
	await cacheHelper.del(hardDeleteKey);

	// Invalidate cache
	await cacheHelper.del(`${CACHE_PREFIX}${id}`);
	await cacheHelper.clearPattern(`${CACHE_PREFIX}*`);

	return data;
}

/**
 * Permanently deletes a time entry row from the database. **Irreversible** — call
 * {@link softDeleteTimeEntry} first if an undo window is required.
 *
 * Called by the cleanup cron (`/api/cron/cleanup-soft-deletes`) after the undo window
 * expires, or directly when an immediate hard delete is needed. Ownership is verified
 * against `userId` before deletion. Cache is invalidated after the delete.
 *
 * @param id     - UUID of the time entry to permanently delete.
 * @param userId - Internal Supabase `user_profiles.id` — must match the entry's owner.
 * @returns The deleted {@link TimeEntry} row (fetched before deletion).
 */
export async function hardDeleteTimeEntry(id: string, userId: string): Promise<TimeEntry> {
	const entry = await getTimeEntryById(id);
	if (!entry) {
		throw new Error(`Time entry ${id} not found`);
	}

	if (entry.user_id !== userId) {
		throw new Error("Unauthorized to delete this time entry");
	}

	const { error } = await supabaseAdmin.from("time_entry").delete().eq("id", id);

	if (error) {
		throw error;
	}

	// Invalidate cache
	await cacheHelper.del(`${CACHE_PREFIX}${id}`);
	await cacheHelper.clearPattern(`${CACHE_PREFIX}*`);

	return entry;
}

/**
 * Hard-deletes time entries whose soft-delete was never restored within the undo window.
 *
 * Scans for rows where `deleted_at` is set and is older than 10 seconds — the expected
 * undo window. Each matched entry is passed to {@link hardDeleteTimeEntry} individually so
 * a single failure does not abort the rest. This function is the fallback for entries whose
 * `hard_delete:*` Redis key was lost or never written; the primary drain path is the
 * cleanup cron which reads that key queue first.
 *
 * @returns Array of {@link TimeEntry} rows that were successfully hard-deleted.
 */
export async function cleanupOrphanedSoftDeletes(): Promise<TimeEntry[]> {
	const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();

	// Find orphaned soft-deleted entries
	const { data: orphanedEntries, error: fetchError } = await supabaseAdmin.from("time_entry").select("*").not("deleted_at", "is", null).lt("deleted_at", tenSecondsAgo);

	if (fetchError) {
		console.error("Error fetching orphaned soft-deletes:", fetchError);
		return [];
	}

	if (!orphanedEntries || orphanedEntries.length === 0) {
		return [];
	}

	// Hard delete them
	const deletedEntries: TimeEntry[] = [];
	for (const entry of orphanedEntries) {
		try {
			await hardDeleteTimeEntry(entry.id, entry.user_id);
			deletedEntries.push(entry);
		} catch (err) {
			console.error(`Error hard deleting orphaned entry ${entry.id}:`, err);
		}
	}

	return deletedEntries;
}

/**
 * Permanently delete monday_items trashed more than `days` ago (default 31, a 1-day
 * buffer over Monday's 30-day trash retention) along with their time entries.
 * Delegates to the purge_trashed_monday_items RPC so deletion is transactional.
 */
export async function purgeTrashedMondayItems(days = 31): Promise<{ items: number; timeEntries: number }> {
	const { data, error } = await supabaseAdmin.rpc("purge_trashed_monday_items" as any, { p_days: days });

	if (error) {
		console.error("Error purging trashed monday items:", error);
		return { items: 0, timeEntries: 0 };
	}

	const row = Array.isArray(data) ? data[0] : data;
	return {
		items: Number(row?.purged_items ?? 0),
		timeEntries: Number(row?.purged_time_entries ?? 0),
	};
}
