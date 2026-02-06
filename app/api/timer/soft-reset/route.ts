import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";

export async function POST(request: NextRequest) {
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

		const body = await request.json();
		const { draftId, sessionId } = body;

		if (!draftId || !sessionId) {
			return NextResponse.json({ error: "draftId and sessionId are required" }, { status: 400 });
		}

		// Delete timer_session (cascades to timer_segments)
		const { error: sessionError } = await supabaseAdmin.from("timer_session").delete().eq("id", sessionId).eq("user_id", userId);

		if (sessionError) throw sessionError;

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error resetting timer:", error);
		return NextResponse.json({ error: "Failed to reset timer" }, { status: 500 });
	}
}
