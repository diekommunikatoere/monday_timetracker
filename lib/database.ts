import { supabaseAdmin } from "@/lib/supabase/server";
import { cacheHelper } from "@/lib/redis";
import type { Database, FinalizeSegmentResult } from "@/types/database";

type TimeEntry = Database["public"]["Tables"]["time_entry"]["Row"];
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
	const { data, error } = await supabaseAdmin.from("time_entry").select("*").order("created_at", { ascending: true });

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
export async function getUserTimeEntries(userId: string): Promise<TimeEntry[]> {
	console.log(`Fetching time entries for userId: ${userId}`);

	/* const cacheKey = `${CACHE_PREFIX}user:${userId}`;

	// Try cache first
	const cached = await cacheHelper.get<TimeEntry[]>(cacheKey);
	if (cached) {
		console.log(`✅ Cache hit: getUserTimeEntries(${userId})`);
		return cached;
	} */

	// Fetch from database
	const { data, error } = await supabaseAdmin.from("time_entry").select("*").eq("user_id", userId).eq("is_draft", false).order("created_at", { ascending: false });
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
