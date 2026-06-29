// POST /api/timer/start — begin a new running timer.
// timer_start atomically pauses any timer the user already has running (the client
// gates this behind the O2 confirm dialog) and opens a fresh running timer with its
// first segment. Resuming a paused/parked timer is a separate route (/api/timer/resume).
// Optional board/item/role pre-assign the entry (e.g. when started from the item sidebar).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";

export async function POST(request: NextRequest) {
	console.log("[API /timer/start] Received start timer request");
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

		const requestBody = await request.json().catch(() => ({}));
		const { boardId, itemId, roleId } = requestBody;

		const { data: entry, error } = await supabaseAdmin.rpc("timer_start", {
			p_user_id: userProfile.id,
			p_board_id: boardId || undefined,
			p_item_id: itemId || undefined,
			p_role_id: roleId || undefined,
		});

		if (error) throw error;

		return NextResponse.json({ entry });
	} catch (error) {
		console.error("[API /timer/start] Error starting timer:", error);
		return NextResponse.json({ error: "Failed to start timer" }, { status: 500 });
	}
}
