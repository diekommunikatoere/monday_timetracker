import { supabaseAdmin } from "@/lib/supabase/server";
import { cacheHelper } from "@/lib/redis";
import type { Database } from "@/types/database";

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
	const cacheKey = `${CACHE_PREFIX}user:${userId}`;

	// Try cache first
	const cached = await cacheHelper.get<TimeEntry[]>(cacheKey);
	if (cached) {
		console.log(`✅ Cache hit: getUserTimeEntries(${userId})`);
		return cached;
	}

	// Fetch from database
	const { data, error } = await supabaseAdmin.from("time_entry").select("*").eq("user_id", userId).order("created_at", { ascending: false });

	if (error) {
		console.error("Error fetching user time entries:", error);
		throw error;
	}

	// Cache the result
	await cacheHelper.set(cacheKey, data, CACHE_TTL);
	console.log(`💾 Cached: getUserTimeEntries(${userId})`);

	return data;
}

// Get current timer session
export async function getCurrentTimerSession(userId: string): Promise<TimerSession | null> {
	const { data, error } = await supabaseAdmin.from("timer_session").select("*").eq("user_id", userId).or("is_running.eq.true,is_paused.eq.true").single();

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

	// Ensure required fields for insert
	const insertData = {
		user_id: sessionData.user_id,
		start_time: sessionData.start_time || new Date().toISOString(),
		elapsed_time: sessionData.elapsed_time || 0,
		is_running: sessionData.is_running ?? false,
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
export async function startTimer(userId: string) {
	if (!userId) {
		throw new Error("user_id is required");
	}

	const now = new Date().toISOString();

	try {
		// Check for existing active session and clear if needed
		const existingSession = await getCurrentTimerSession(userId);
		if (existingSession) {
			await clearTimerSession(userId);
		}

		// Create draft time_entry
		const { data: draft, error: draftError } = await supabaseAdmin
			.from("time_entry")
			.insert({
				user_id: userId,
				is_draft: true,
				start_time: now,
			})
			.select()
			.single();

		if (draftError) throw draftError;

		// Create timer_session
		const { data: session, error: sessionError } = await supabaseAdmin
			.from("timer_session")
			.insert({
				user_id: userId,
				draft_id: draft.id,
				start_time: now,
				is_running: true,
				elapsed_time: 0,
			})
			.select()
			.single();

		if (sessionError) throw sessionError;

		// Create initial running timer_segment
		const { error: segmentError } = await supabaseAdmin.from("timer_segment").insert({
			session_id: session.id,
			start_time: now,
			is_running: true,
		});

		if (segmentError) throw segmentError;

		return { draftId: draft.id, sessionId: session.id, session };
	} catch (error) {
		console.error("Error starting timer:", error);
		throw error;
	}
}

// Toggle pause/resume: Handle segments and session update
export async function togglePause(userId: string, elapsedTime: number, isPausing: boolean) {
	const session = await getCurrentTimerSession(userId);
	if (!session) {
		throw new Error("No active session found");
	}

	const now = new Date().toISOString();

	try {
		if (isPausing) {
			// End current running segment
			const { error: endRunningError } = await supabaseAdmin.from("timer_segment").update({ end_time: now }).eq("session_id", session.id).is("end_time", null).eq("is_running", true);

			if (endRunningError) throw endRunningError;

			// Create pause segment
			await supabaseAdmin.from("timer_segment").insert({
				session_id: session.id,
				start_time: now,
				is_pause: true,
			});
		} else {
			// End current pause segment
			const { error: endPauseError } = await supabaseAdmin.from("timer_segment").update({ end_time: now }).eq("session_id", session.id).is("end_time", null).eq("is_pause", true);

			if (endPauseError) throw endPauseError;

			// Create running segment
			await supabaseAdmin.from("timer_segment").insert({
				session_id: session.id,
				start_time: now,
				is_running: true,
			});
		}

		// Update session
		const { data: updatedSession, error: sessionError } = await supabaseAdmin
			.from("timer_session")
			.update({
				is_running: !isPausing,
				is_paused: isPausing,
				elapsed_time: elapsedTime,
			})
			.eq("id", session.id)
			.select()
			.single();

		if (sessionError) throw sessionError;

		return updatedSession;
	} catch (error) {
		console.error("Error toggling pause:", error);
		throw error;
	}
}
