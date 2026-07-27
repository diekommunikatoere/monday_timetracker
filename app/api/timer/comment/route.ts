// PATCH /api/timer/comment — debounced auto-save of the live timer's comment.
//
// A live timer IS a non-finalized time_entry, so saving the comment is a direct,
// ownership-guarded UPDATE of time_entry.comment — not a state transition, so it
// needs no RPC. Guarded to non-finalized rows so a finalized entry can't be edited
// through this path (those use the edit modal). Realtime on time_entry then
// propagates the new comment to the user's other devices.
import { NextRequest, NextResponse } from "next/server";

import { getUserProfileByMondayId } from "@/lib/database/users";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
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
		const { entryId, comment } = requestBody;

		if (!entryId) {
			return NextResponse.json({ error: "Missing entryId in request body" }, { status: 400 });
		}

		const { error } = await supabaseAdmin
			.from("time_entry")
			.update({ comment: comment ?? "", updated_at: new Date().toISOString() })
			.eq("id", entryId)
			.eq("user_id", userProfile.id)
			.neq("timer_state", "finalized");

		if (error) throw error;

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("[API /timer/comment] Error saving comment:", error);
		return NextResponse.json({ error: "Failed to save comment" }, { status: 500 });
	}
}
