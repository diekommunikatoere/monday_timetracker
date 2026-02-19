import { supabaseAdmin } from "@/lib/supabase/server";
import { cacheHelper } from "@/lib/redis";
import type { Database, FinalizeSegmentResult } from "@/types/database";
import { TimeEntry as FrontendTimeEntry } from "@/types/time-entry";
import { roundDuration } from "./utils";
import { fetchAllWithRange, fetchAllWithKeyset } from "./supabase/pagination";

type TimeEntry = Database["public"]["Tables"]["time_entry"]["Row"];
type TimeEntryWithRole = FrontendTimeEntry;
type TimeEntryInsert = Database["public"]["Tables"]["time_entry"]["Insert"];
type TimeEntryUpdate = Database["public"]["Tables"]["time_entry"]["Update"];
type TimerSession = Database["public"]["Tables"]["timer_session"]["Row"];
type TimerSessionInsert = Database["public"]["Tables"]["timer_session"]["Insert"];
type TimerSegmentInsert = Database["public"]["Tables"]["timer_segment"]["Insert"];

// ============================================
// Dimension Management Helpers
// ============================================

export interface DimensionMetadata {
	board_name?: string;
	item_name?: string;
	parent_item_name?: string;
	role_name?: string;
	task_name?: string;
}

/**
 * Upsert a Monday board into the dimension table
 */
export async function upsertMondayBoard(id: string, name: string) {
	if (!id || !name) return;

	const { error } = await supabaseAdmin.from("monday_board").upsert({ id, name, updated_at: new Date().toISOString() }, { onConflict: "id" });

	if (error) {
		console.error(`Error upserting monday_board ${id}:`, error);
	}
}

/**
 * Fetch tasks (items and subitems) for a board from the database.
 * Filters by active items and synced groups.
 * Uses a two-step query to avoid FK join issues.
 */
export async function getTasksFromDB(boardId: string) {
	console.log(`[getTasksFromDB] Fetching tasks for board ${boardId}`);
	// Step 1: Get all synced groups for this board, ordered by their board position
	const { data: allGroups, error: groupsError } = await supabaseAdmin.from("monday_group").select("id, title, position, sync_enabled").eq("board_id", boardId).order("position", { ascending: true });

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
	const groupInfoMap = new Map(syncedGroups.map((g) => [g.id, { title: g.title, position: g.position }]));

	// Step 2: Get all active items (parents and subitems) from synced groups using the view
	// First, let's see how many items are in the board total vs synced
	const { count: totalBoardItems } = await supabaseAdmin.from("view_monday_tasks").select("*", { count: "exact", head: true }).eq("board_id", boardId);
	const { count: activeBoardItems } = await supabaseAdmin.from("view_monday_tasks").select("*", { count: "exact", head: true }).eq("board_id", boardId).eq("is_active", true);

	console.log(`[getTasksFromDB] Board ${boardId} total items (from view): ${totalBoardItems}, active items: ${activeBoardItems}`);

	// Step 3: Fetch the items with group filtering using pagination for large boards
	// Use keyset pagination on 'name' column for efficient fetching
	// Note: We select board_id and is_active to enable in-memory filtering
	const result = await fetchAllWithKeyset(supabaseAdmin, "view_monday_tasks", "name", "id, name, parent_item_id, parent_item_name, group_id, board_id, is_active", { batchSize: 1000 });

	if (!result.success) {
		console.error(`Error fetching items from DB for board ${boardId}:`, result.error);
		throw new Error(result.error || "Failed to fetch tasks");
	}

	// Apply filters in memory (board_id, is_active, group_id)
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

	const items = result.data.filter((item: ViewMondayTask) => item.board_id === boardId && item.is_active === true && syncedGroupIds.includes(item.group_id!)) as ViewMondayTask[];

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
 * Upsert a Monday item into the dimension table
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

interface MondayItemData {
	id: string;
	name: string;
	boardId: string;
	parentItemId?: string | null;
	groupId?: string | null;
}

/**
 * Batch upsert multiple Monday items into the dimension table
 * This is more efficient than individual upserts and prevents connection pool exhaustion
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

const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = "time_entry:";

// Get all time entries with pagination support
export async function getAllTimeEntries(): Promise<TimeEntry[]> {
	const cacheKey = `${CACHE_PREFIX}all`;

	// Try cache first
	const cached = await cacheHelper.get<TimeEntry[]>(cacheKey);
	if (cached) {
		console.log("✅ Cache hit: getAllTimeEntries");
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
	console.log(`💾 Cached: getAllTimeEntries (${result.count} entries in ${result.batches} batches)`);

	return result.data;
}

// Get time entry by ID
export async function getTimeEntryById(id: string): Promise<TimeEntry | null> {
	const cacheKey = `${CACHE_PREFIX}${id}`;

	// Try cache first
	const cached = await cacheHelper.get<TimeEntry>(cacheKey);
	if (cached) {
		console.log(`✅ Cache hit: getTimeEntryById(${id})`);
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
 * Get time entries for a specific item across all users
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

// Insert time entry
export async function insertTimeEntry(entry: TimeEntryInsert & DimensionMetadata, userId: string): Promise<TimeEntry> {
	// Make sure user_id is provided
	if (!entry.user_id) {
		throw new Error("user_id is required to create a time entry");
	}

	// Extract dimension metadata and other non-database fields
	const { board_name, item_name, parent_item_name, role_name, task_name, ...cleanEntry } = entry;

	// UPSERT dimension tables if names are provided
	if (cleanEntry.board_id && board_name) {
		await upsertMondayBoard(cleanEntry.board_id, board_name);
	}

	// For subitems, ensure we use the parent's board_id if available
	if (cleanEntry.parent_item_id) {
		const { data: parentItem } = await supabaseAdmin.from("monday_item").select("board_id").eq("id", cleanEntry.parent_item_id).single();
		if (parentItem?.board_id) {
			cleanEntry.board_id = parentItem.board_id;
		}
	}

	if (cleanEntry.item_id && item_name) {
		await upsertMondayItem(cleanEntry.item_id, item_name, cleanEntry.board_id!, cleanEntry.parent_item_id);
	}

	if (cleanEntry.parent_item_id && parent_item_name) {
		await upsertMondayItem(cleanEntry.parent_item_id, parent_item_name, cleanEntry.board_id!);
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
// Delete time entry
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

// Get time entries for a specific user
export async function getUserTimeEntries(userId: string): Promise<TimeEntryWithRole[]> {
	// Fetch from database using RPC to get joined names
	const { data, error } = await supabaseAdmin.rpc("get_user_time_entries", {
		p_user_id: userId,
		p_limit: 100,
	} as any);

	if (error) {
		console.error("Error fetching user time entries:", error);
		throw error;
	}

	return data as any;
}

// Get current timer session
export async function getCurrentTimerSession(userId: string): Promise<TimerSession | null> {
	const { data, error } = await supabaseAdmin.from("timer_session").select("*").eq("user_id", userId).single();

	if (error && error.code !== "PGRST116") {
		console.error("Error fetching timer session:", error);
		return null;
	}

	return data || null;
}

// Upsert timer session (insert if not exists, update if exists based on user_id and active state)
export async function upsertTimerSession(sessionData: Partial<TimerSessionInsert>, userId: string): Promise<TimerSession> {
	if (!sessionData.user_id) {
		throw new Error("user_id is required");
	}

	console.log("Upserting timer session with data:", sessionData);

	// Ensure required fields for insert
	// NOTE: Do NOT pass start_time - let database use DEFAULT NOW() for timestamp consistency
	const insertData = {
		user_id: sessionData.user_id,
		elapsed_time: sessionData.elapsed_time || 0,
		is_paused: sessionData.is_paused ?? false,
		draft_id: sessionData.draft_id,
	} as TimerSessionInsert;

	const { data, error } = await supabaseAdmin.from("timer_session").upsert(insertData, { onConflict: "user_id" }).select().single();

	if (error) {
		console.error("Error upserting timer session:", error);
		throw error;
	}

	return data;
}

// Clear timer session by deleting draft (cascades)
export async function clearTimerSession(userId: string): Promise<void> {
	const { data: draft } = await supabaseAdmin.from("time_entry").select("id").eq("user_id", userId).eq("is_draft", true).order("created_at", { ascending: false }).limit(1).single();

	if (draft) {
		// Delete the draft (this cascades to timer_session and timer_segments)
		const { error } = await supabaseAdmin.from("time_entry").delete().eq("id", draft.id);

		if (error) {
			console.error(`Error clearing timer session for user ${userId}:`, error);
			throw error;
		}

		// Invalidate cache
		await cacheHelper.clearPattern(`${CACHE_PREFIX}*`);
	}
}

// Start timer: Create draft, session, and initial segment
// NOTE: All start_time values are set by database DEFAULT NOW() to ensure timestamp consistency
// This prevents clock drift issues between app server and database server
export async function startTimer(userId: string) {
	if (!userId) {
		throw new Error("user_id is required");
	}

	try {
		// Check for existing active session and clear if needed
		const existingSession = await getCurrentTimerSession(userId);
		if (existingSession) {
			await clearTimerSession(userId);
		}

		// Create draft time_entry - start_time will be set by database DEFAULT NOW()
		const { data: draft, error: draftError } = await supabaseAdmin
			.from("time_entry")
			.insert({
				user_id: userId,
				is_draft: true,
				// Do NOT pass start_time - database will use DEFAULT NOW()
			})
			.select()
			.single();

		if (draftError) throw draftError;

		// Create timer_session - start_time will be set by database DEFAULT NOW()
		const { data: session, error: sessionError } = await supabaseAdmin
			.from("timer_session")
			.insert({
				user_id: userId,
				draft_id: draft.id,
				elapsed_time: 0,
				// Do NOT pass start_time - database will use DEFAULT NOW()
			})
			.select()
			.single();

		if (sessionError) throw sessionError;

		// Create initial running timer_segment - start_time will be set by database DEFAULT NOW()
		const { error: segmentError } = await supabaseAdmin.from("timer_segment").insert({
			session_id: session.id,
			// Do NOT pass start_time - database will use DEFAULT NOW()
			// end_time/duration null implicit
		});

		if (segmentError) throw segmentError;

		return { draftId: draft.id, sessionId: session.id, session };
	} catch (error) {
		console.error("Error starting timer:", error);
		throw error;
	}
}

// Start a new running segment when resuming timer
// NOTE: start_time is set by database DEFAULT NOW() to ensure timestamp consistency
export async function startRunningSegment(sessionId: string, userId: string) {
	console.log("Starting running segment for session:", sessionId);
	// Verify session ownership
	const { data: session, error: sessionError } = await supabaseAdmin.from("timer_session").select("id").eq("id", sessionId).eq("user_id", userId).single();

	if (sessionError || !session) {
		throw new Error("Timer session not found or access denied");
	}

	// Create segment - start_time will be set by database DEFAULT NOW()
	const { data, error } = await supabaseAdmin
		.from("timer_segment")
		.insert({
			session_id: sessionId,
			// Do NOT pass start_time - database will use DEFAULT NOW()
			// end_time/duration null implicit
		})
		.select("id")
		.single();

	if (error) {
		console.error("Error starting running segment:", error);
		throw error;
	}

	return data;
}

export async function pauseTimer(sessionId: string, userId: string): Promise<FinalizeSegmentResult> {
	console.log("Pausing timer for session:", sessionId);
	// Call RPC to finalize open segment(s) - uses database NOW() for end_time
	const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("finalize_segment", { p_session_id: sessionId });

	if (rpcError || !rpcResult) {
		console.error("Error finalizing segment:", rpcError);
		throw new Error("Failed to finalize timer segment");
	}

	// Cast to proper type - RPC returns the jsonb object
	const result = rpcResult as unknown as FinalizeSegmentResult;

	console.log("Segment finalized, RPC result:", result);

	// Update session flags and elapsed time in one operation
	const { error: sessionUpdateError } = await supabaseAdmin
		.from("timer_session")
		.update({
			is_paused: true,
			elapsed_time: result.elapsed_time_ms, // Use RPC result to avoid separate updates
		})
		.eq("id", sessionId)
		.eq("user_id", userId);

	if (sessionUpdateError) {
		console.error("Error updating session pause state:", sessionUpdateError);
		throw sessionUpdateError;
	}

	return result;
}

export async function resumeTimer(sessionId: string, userId: string) {
	console.log("Resuming timer for session:", sessionId);
	// Verify session ownership
	const { data: session, error: sessionError } = await supabaseAdmin.from("timer_session").select("id").eq("id", sessionId).eq("user_id", userId).single();

	if (sessionError || !session) {
		throw new Error("Timer session not found or access denied");
	}

	// Start new running segment - start_time will be set by database
	await startRunningSegment(sessionId, userId);

	// Update session flags to reflect resume (elapsed_time will be updated via real-time or API if needed)
	const { error: sessionUpdateError } = await supabaseAdmin
		.from("timer_session")
		.update({
			is_paused: false,
		})
		.eq("id", sessionId)
		.eq("user_id", userId);

	if (sessionUpdateError) {
		console.error("Error updating session resume state:", sessionUpdateError);
		throw sessionUpdateError;
	}

	return { message: "Timer resumed successfully" };
}

// =====================================
// Time Entry Update & Delete Functions
// =====================================

/**
 * Update a time entry by ID with optimistic locking
 * Returns both old and new entry states for sync comparison
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
	const { board_name, item_name, parent_item_name, role_name, task_name, id: _id, ...cleanUpdates } = updates;

	// UPSERT dimension tables if names are provided
	if (cleanUpdates.board_id && board_name) {
		await upsertMondayBoard(cleanUpdates.board_id, board_name);
	}

	// For subitems, ensure we use the parent's board_id if available
	const parentItemId = cleanUpdates.parent_item_id || oldEntry.parent_item_id;
	if (parentItemId) {
		const { data: parentItem } = await supabaseAdmin.from("monday_item").select("board_id").eq("id", parentItemId).single();
		if (parentItem?.board_id) {
			cleanUpdates.board_id = parentItem.board_id;
		}
	}

	// Use board_id from updates or fallback to old entry
	const boardId = cleanUpdates.board_id || oldEntry.board_id;

	if (cleanUpdates.item_id && item_name && boardId) {
		await upsertMondayItem(cleanUpdates.item_id, item_name, boardId, cleanUpdates.parent_item_id || oldEntry.parent_item_id);
	}

	if (cleanUpdates.parent_item_id && parent_item_name && boardId) {
		await upsertMondayItem(cleanUpdates.parent_item_id, parent_item_name, boardId);
	}

	// Apply rounding logic
	if (cleanUpdates.duration !== undefined && cleanUpdates.duration !== null) {
		cleanUpdates.duration = roundDuration(cleanUpdates.duration);
	}

	// Update entry
	const { data, error } = await supabaseAdmin
		.from("time_entry")
		.update({
			...cleanUpdates,
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
 * Soft-delete a time entry
 * Schedules hard delete via Redis key with 5-second TTL
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
 * Restore a soft-deleted time entry (undo operation)
 * Cancels scheduled hard delete by removing Redis key
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
 * Permanently delete a time entry
 * Called by cleanup job or after undo window expires
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
 * Cleanup orphaned soft-deletes
 * Finds entries where deleted_at < NOW() - 10 seconds and hard deletes them
 * Returns array of deleted entries for sync purposes
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
