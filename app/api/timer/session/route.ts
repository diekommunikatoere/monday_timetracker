import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
	try {
		// Authenticate user
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const { data: userId } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();

		// Fetch active or paused session for the user
		const { data: session, error: sessionError } = await supabaseAdmin
			.from("timer_session")
			.select(
				`
				*,
				time_entry!draft_id (
					comment
				)
			`
			)
			.eq("user_id", userId.id)
			.single();

		if (sessionError && sessionError.code !== "PGRST116") {
			throw sessionError;
		}

		if (session) {
			let calculatedElapsedTime = session.elapsed_time;

			// If timer is currently running, calculate real elapsed time
			if (session.id && !session.is_paused) {
				const { data: currentSegment } = await supabaseAdmin.from("timer_segment").select("start_time").eq("session_id", session.id).is("end_time", null).order("start_time", { ascending: false }).limit(1).single();

				if (currentSegment) {
					const segmentStartTime = new Date(currentSegment.start_time).getTime();
					const now = Date.now();
					const additionalTime = now - segmentStartTime;
					calculatedElapsedTime = session.elapsed_time + additionalTime;
				}
			}

			return NextResponse.json({
				session: {
					...session,
					calculatedElapsedTime,
				},
			});
		} else {
			return NextResponse.json({ session: null });
		}
	} catch (error) {
		console.error("Error loading timer session:", error);
		return NextResponse.json({ error: "Failed to load timer session" }, { status: 500 });
	}
}
