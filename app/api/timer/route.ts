// GET /api/timer — the user's active (non-finalized) timers, with live elapsed time.
// Replaces the old GET /api/timer/session. Backed by the get_active_timers RPC
// (running/paused/parked rows + computed elapsed_seconds); the client ticks the
// live second locally between updates.
import { NextRequest, NextResponse } from "next/server";

import { getUserProfileByMondayId } from "@/lib/database/users";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

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

		const { data, error } = await supabaseAdmin.rpc("get_active_timers", {
			p_user_id: userProfile.id,
		});

		if (error) throw error;

		return NextResponse.json({ timers: data ?? [] });
	} catch (error) {
		console.error("[API /timer] Error fetching active timers:", error);
		return NextResponse.json({ error: "Failed to fetch active timers" }, { status: 500 });
	}
}
