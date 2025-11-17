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

		// Check for existing running session
		const { data: existingSession } = await supabaseAdmin.from("timer_session").select("*").eq("user_id", userId.id).eq("is_running", true).single();

		if (existingSession) {
			// Resume existing session
			let calculatedElapsedTime = existingSession.elapsed_time;
			if (!existingSession.is_paused) {
				const { data: currentSegment } = await supabaseAdmin.from("timer_segment").select("start_time").eq("session_id", existingSession.id).eq("is_running", true).is("end_time", null).order("start_time", { ascending: false }).limit(1).single();

				if (currentSegment) {
					const segmentStartTime = new Date(currentSegment.start_time).getTime();
					calculatedElapsedTime = existingSession.elapsed_time + (Date.now() - segmentStartTime);
				}
			}

			return NextResponse.json({
				session: existingSession,
				elapsedTime: calculatedElapsedTime,
				resumed: true,
			});
		}

		// Create new session
		const now = new Date().toISOString();

		// Create draft time_entry
		const { data: draft, error: draftError } = await supabaseAdmin
			.from("time_entry")
			.insert({
				user_id: userId.id,
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
				user_id: userId.id,
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

		return NextResponse.json({
			session,
			draft,
			elapsedTime: 0,
			created: true,
		});
	} catch (error) {
		console.error("Error starting timer:", error);
		return NextResponse.json({ error: "Failed to start timer" }, { status: 500 });
	}
}
