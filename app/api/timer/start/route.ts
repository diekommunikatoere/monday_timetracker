import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { startTimer, startRunningSegment } from "@/lib/database";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";
import type { GetCurrentElapsedTimeResult } from "@/types/database";

export async function POST(request: NextRequest) {
	console.log("Received start timer request");
	try {
		// Validate session
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		// Get user profile
		const userProfile = await getUserProfileByMondayId(session.userId);
		if (!userProfile) {
			return NextResponse.json({ error: "User profile not found" }, { status: 404 });
		}

		const userId = userProfile.id;

		// Check for existing paused session to resume
		const { data: existingSession } = await supabaseAdmin.from("timer_session").select("*").eq("user_id", userId).eq("is_paused", true).single();

		if (existingSession) {
			console.log("Resuming existing paused session:", existingSession.id);
			// Resume existing session: start new running segment
			await startRunningSegment(existingSession.id, userId);

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

			// Get server-calculated elapsed time using RPC
			const { data: elapsedTimeResult, error: rpcError } = await supabaseAdmin.rpc("get_current_elapsed_time", { p_session_id: existingSession.id });

			let calculatedElapsedTime = existingSession.elapsed_time;
			if (!rpcError && elapsedTimeResult) {
				const typedResult = elapsedTimeResult as unknown as GetCurrentElapsedTimeResult;
				calculatedElapsedTime = typedResult.elapsed_time_ms;
			}

			return NextResponse.json({
				session: updatedSession,
				elapsedTime: calculatedElapsedTime,
				resumed: true,
			});
		}

		// Create new session
		const result = await startTimer(userId);

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
