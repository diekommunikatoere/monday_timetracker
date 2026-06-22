import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";

export async function POST(request: NextRequest) {
	try {
		// Validate session
		const authHeader = request.headers.get("authorization");
		console.log("Received reset request.");
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

		const draftIdHeader = request.headers.get("draft-id");
		if (!draftIdHeader) {
			return NextResponse.json({ error: "Missing draft-id header" }, { status: 400 });
		}

		const sessionIdHeader = request.headers.get("session-id");
		if (!sessionIdHeader) {
			return NextResponse.json({ error: "Missing session-id header" }, { status: 400 });
		}

		console.log("Resetting timer for user:", userId, "draft:", draftIdHeader, "session:", sessionIdHeader);

		// Delete timer_session first (cascades to timer_segments)
		const { error: sessionError } = await supabaseAdmin.from("timer_session").delete().eq("id", sessionIdHeader).eq("user_id", userId);

		if (sessionError) throw sessionError;

		// Then delete draft time_entry
		const { error: draftError } = await supabaseAdmin.from("time_entry").delete().eq("id", draftIdHeader).eq("user_id", userId);

		if (draftError) throw draftError;

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error resetting timer:", error);
		return NextResponse.json({ error: "Failed to reset timer" }, { status: 500 });
	}
}
