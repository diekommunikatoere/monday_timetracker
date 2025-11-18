import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";
import { startTimer, startRunningSegment } from "@/lib/database";

export async function POST(request: NextRequest) {
	try {
		// Authenticate user
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const { data: userId } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();

		// Check for existing paused session to resume
		const { data: existingSession } = await supabaseAdmin.from("timer_session").select("*").eq("user_id", userId.id).eq("is_paused", true).single();

		if (existingSession) {
			console.log("Resuming existing paused session:", existingSession.id);
			// Resume existing session: start new running segment
			await startRunningSegment(existingSession.id, userId.id);

			// Update session to running
			const { data: updatedSession, error: updateError } = await supabaseAdmin
				.from("timer_session")
				.update({
					is_paused: false,
				})
				.eq("id", existingSession.id)
				.select()
				.single();

			if (updateError) throw updateError;

			return NextResponse.json({
				session: updatedSession,
				elapsedTime: existingSession.elapsed_time,
				resumed: true,
			});
		}

		// Create new session
		const result = await startTimer(userId.id);

		return NextResponse.json({
			session: result.session,
			draft: { id: result.draftId },
			elapsedTime: 0,
			created: true,
		});
	} catch (error) {
		console.error("Error starting timer:", error);
		return NextResponse.json({ error: "Failed to start timer" }, { status: 500 });
	}
}
