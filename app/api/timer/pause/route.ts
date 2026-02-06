import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pauseTimer, resumeTimer } from "@/lib/database";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";
import type { GetCurrentElapsedTimeResult } from "@/types/database";

export async function POST(request: NextRequest) {
	try {
		console.log("Received pause/resume timer request");
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

		const { sessionId, elapsedTime, isPausing } = await request.json();

		if (!sessionId) {
			return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
		}

		if (isPausing) {
			await pauseTimer(sessionId, userId);

			// Get the final elapsed time from the server after pausing
			const { data: elapsedTimeResult, error: rpcError } = await supabaseAdmin.rpc("get_current_elapsed_time", { p_session_id: sessionId });

			let calculatedElapsedTime = elapsedTime;
			if (!rpcError && elapsedTimeResult) {
				const typedResult = elapsedTimeResult as unknown as GetCurrentElapsedTimeResult;
				calculatedElapsedTime = typedResult.elapsed_time_ms;
			}

			return NextResponse.json({
				success: true,
				paused: true,
				elapsedTime: calculatedElapsedTime,
			});
		} else {
			await resumeTimer(sessionId, userId);

			// Get the current elapsed time after resuming
			const { data: elapsedTimeResult, error: rpcError } = await supabaseAdmin.rpc("get_current_elapsed_time", { p_session_id: sessionId });

			let calculatedElapsedTime = elapsedTime;
			if (!rpcError && elapsedTimeResult) {
				const typedResult = elapsedTimeResult as unknown as GetCurrentElapsedTimeResult;
				calculatedElapsedTime = typedResult.elapsed_time_ms;
			}

			return NextResponse.json({
				success: true,
				paused: false,
				elapsedTime: calculatedElapsedTime,
			});
		}
	} catch (error) {
		console.error("Error pausing timer:", error);
		return NextResponse.json({ error: "Failed to pause timer" }, { status: 500 });
	}
}
