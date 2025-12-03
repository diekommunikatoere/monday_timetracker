import { supabaseAdmin } from "@/lib/supabase/server";
import { cacheHelper } from "@/lib/redis";
import type { Database, FinalizeSegmentResult } from "@/types/database";

type TimeEntry = Database["public"]["Tables"]["time_entry"]["Row"];
type TimeEntryWithRole = TimeEntry & { role: { name: string } };
type TimeEntryInsert = Database["public"]["Tables"]["time_entry"]["Insert"];
type TimeEntryUpdate = Database["public"]["Tables"]["time_entry"]["Update"];
type TimerSession = Database["public"]["Tables"]["timer_session"]["Row"];
type TimerSessionInsert = Database["public"]["Tables"]["timer_session"]["Insert"];
type TimerSegmentInsert = Database["public"]["Tables"]["timer_segment"]["Insert"];

const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = "time_entry:";

// Get all time entries
export async function getAllTimeEntries(): Promise<TimeEntry[]> {
	const cacheKey = `${CACHE_PREFIX}all`;

	// Try cache first
	const cached = await cacheHelper.get<TimeEntry[]>(cacheKey);
	if (cached) {
		console.log("✅ Cache hit: getAllTimeEntries");
		return cached;
	}

	// Fetch from database
	const { data, error } = await supabaseAdmin.from("time_entry").select("*").is("deleted_at", null).order("created_at", { ascending: true });

	if (error) {
		console.error("Error fetching time entries:", error);
		throw error;
	}

	// Cache the result
	await cacheHelper.set(cacheKey, data, CACHE_TTL);
	console.log("💾 Cached: getAllTimeEntries");

	return data;
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

// Insert time entry
export async function insertTimeEntry(entry: TimeEntryInsert, userId: string): Promise<TimeEntry> {
	// Make sure user_id is provided
	if (!entry.user_id) {
		throw new Error("user_id is required to create a time entry");
	}

	const { data, error } = await supabaseAdmin.from("time_entry").insert(entry).select().single();

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
	console.log(`Fetching time entries for userId: ${userId}`);

	/* const cacheKey = `${CACHE_PREFIX}user:${userId}`;

	// Try cache first
	const cached = await cacheHelper.get<TimeEntry[]>(cacheKey);
	if (cached) {
		console.log(`✅ Cache hit: getUserTimeEntries(${userId})`);
		return cached;
	} */

	// Fetch from database
	const { data, error } = await supabaseAdmin.from("time_entry").select("* , role(name)").eq("user_id", userId).is("deleted_at", null).gt("duration", 0).order("created_at", { ascending: false });
	console.log(`Fetched user time entries for userId: ${userId}`, data);

	if (error) {
		console.error("Error fetching user time entries:", error);
		throw error;
	}

	// Cache the result
	/* await cacheHelper.set(cacheKey, data, CACHE_TTL);
	console.log(`💾 Cached: getUserTimeEntries(${userId})`); */

	return data;
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
export async function updateTimeEntry(id: string, updates: TimeEntryUpdate, userId: string, expectedUpdatedAt?: string): Promise<{ old: TimeEntry; new: TimeEntry }> {
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

	// Update entry
	const { data, error } = await supabaseAdmin
		.from("time_entry")
		.update({
			...updates,
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
		5 // 5 seconds TTL
	);

	// Generate undo token (JWT with 5s expiry)
	const undoToken = Buffer.from(
		JSON.stringify({
			entryId: id,
			userId,
			exp: Date.now() + 5000, // 5 seconds from now
		})
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
