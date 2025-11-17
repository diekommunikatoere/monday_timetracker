import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
	try {
		// Authenticate user
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const { data: userId } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();

		const body = await request.json();
		const { sessionId, elapsedTime } = body;

		if (!sessionId) {
			return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
		}

		// Get current session
		const { data: session, error: sessionFetchError } = await supabaseAdmin.from("timer_session").select("*").eq("id", sessionId).eq("user_id", userId.id).single();

		if (sessionFetchError || !session) {
			return NextResponse.json({ error: "Session not found" }, { status: 404 });
		}

		const now = new Date().toISOString();
		const isPausing = session.is_running && !session.is_paused;

		// Optimistic update logic here, but since it's server-side, just perform the actions

		if (isPausing) {
			// End current running segment
			const { error: endError } = await supabaseAdmin.from("timer_segment").update({ end_time: now }).eq("session_id", sessionId).is("end_time", null).eq("is_running", true);

			if (endError) throw endError;

			// Create pause segment
			const { error: pauseError } = await supabaseAdmin.from("timer_segment").insert({
				session_id: sessionId,
				start_time: now,
				is_pause: true,
			});

			if (pauseError) throw pauseError;
		} else {
			// End current pause segment
			const { error: endPauseError } = await supabaseAdmin.from("timer_segment").update({ end_time: now }).eq("session_id", sessionId).is("end_time", null).eq("is_pause", true);

			if (endPauseError) throw endPauseError;

			// Create running segment
			const { error: resumeError } = await supabaseAdmin.from("timer_segment").insert({
				session_id: sessionId,
				start_time: now,
				is_running: true,
			});

			if (resumeError) throw resumeError;
		}

		// Update session
		const { error: sessionError } = await supabaseAdmin
			.from("timer_session")
			.update({
				is_paused: isPausing,
				elapsed_time: elapsedTime,
			})
			.eq("id", sessionId);

		if (sessionError) throw sessionError;

		return NextResponse.json({ success: true, paused: isPausing });
	} catch (error) {
		console.error("Error toggling timer:", error);
		return NextResponse.json({ error: "Failed to toggle timer" }, { status: 500 });
	}
}
