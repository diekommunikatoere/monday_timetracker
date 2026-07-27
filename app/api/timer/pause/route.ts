// POST /api/timer/pause — hold a running timer.
// timer_pause closes the open segment (the gap until resume is the pause) and sets
// the entry to 'paused'. Idempotent if it's already paused. Resuming is /api/timer/resume.
import { NextRequest, NextResponse } from "next/server";

import { getUserProfileByMondayId } from "@/lib/database/users";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
	try {
		console.log("[API /timer/pause] Received pause timer request");
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

		const requestBody = await request.json().catch(() => ({}));
		const { entryId } = requestBody;

		if (!entryId) {
			return NextResponse.json({ error: "Missing entryId in request body" }, { status: 400 });
		}

		console.log("[API /timer/pause] Pausing timer for user:", userProfile.id, "entry:", entryId);

		const { data: entry, error } = await supabaseAdmin.rpc("timer_pause", {
			p_user_id: userProfile.id,
			p_entry_id: entryId,
		});

		if (error) throw error;

		return NextResponse.json({ entry });
	} catch (error) {
		console.error("[API /timer/pause] Error pausing timer:", error);
		return NextResponse.json({ error: "Failed to pause timer" }, { status: 500 });
	}
}
