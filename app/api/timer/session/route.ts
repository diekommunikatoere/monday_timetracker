import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";
import type { GetTimerSessionWithElapsedResult } from "@/types/database";

export async function GET(request: NextRequest) {
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

		// Use the RPC function to get session with elapsed time calculated server-side
		// This avoids clock drift issues between app server and database
		const { data: result, error: rpcError } = await supabaseAdmin.rpc("get_timer_session_with_elapsed", {
			p_user_id: userId,
		});

		if (rpcError) {
			console.error("Error calling get_timer_session_with_elapsed:", rpcError);
			throw rpcError;
		}

		// Cast to proper type
		const typedResult = result as unknown as GetTimerSessionWithElapsedResult;

		if (typedResult?.session) {
			return NextResponse.json({
				session: {
					...typedResult.session,
					// Use the server-calculated elapsed time
					calculatedElapsedTime: typedResult.calculated_elapsed_time_ms,
				},
				serverTime: typedResult.server_time,
			});
		} else {
			return NextResponse.json({
				session: null,
				serverTime: typedResult?.server_time || new Date().toISOString(),
			});
		}
	} catch (error) {
		console.error("Error loading timer session:", error);
		return NextResponse.json({ error: "Failed to load timer session" }, { status: 500 });
	}
}
