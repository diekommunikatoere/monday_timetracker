// POST /api/timer/start — begin a new running timer.
// timer_start opens a fresh running timer with its first segment. Resuming a paused/parked
// timer is a separate route (/api/timer/resume). Optional board/item/role pre-assign the entry
// (e.g. when started from the item sidebar).
//
// INTERIM single-timer guard (see supabase/migrations/027_timer_start_single_timer_guard.sql):
// the RPC refuses to start when the user already has an active (running/paused) timer and
// raises 'ACTIVE_TIMER_EXISTS'. That maps to HTTP 409 here so the client can re-sync to the
// existing timer instead of creating a new one. This supersedes the "pause any running timer
// and start a new one" behavior 025 originally shipped, which is meant to return once the
// multi-timer O2 confirm dialog exists.
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

		if (error) {
			if (error.message?.includes("ACTIVE_TIMER_EXISTS")) {
				return NextResponse.json({ error: "Es läuft bereits ein Timer." }, { status: 409 });
			}
			throw error;
		}

		return NextResponse.json({ entry });
	} catch (error) {
		console.error("[API /timer/start] Error starting timer:", error);
		return NextResponse.json({ error: "Failed to start timer" }, { status: 500 });
	}
}
