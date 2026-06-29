// Resumes a timer session
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";

export async function POST(request: NextRequest) {
	try {
		// Validate session
		const authHeader = request.headers.get("authorization");
		console.log("[API /timer/resume] Received resume request.");
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

		const requestBody = await request.json().catch(() => ({}));

		const entryId = requestBody.entryId;
		if (!entryId) {
			return NextResponse.json({ error: "Missing entryId in request body" }, { status: 400 });
		}

		console.log("[API /timer/resume] Resuming timer for user:", userId, "entry:", entryId);

		// Call the Supabase RPC function to resume the timer
		const { error: resumeError } = await supabaseAdmin.rpc("timer_resume", {
			p_user_id: userId,
			p_entry_id: entryId,
		});

		if (resumeError) throw resumeError;

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("[API /timer/resume] Error resuming timer:", error);
		return NextResponse.json({ error: "Failed to resume timer" }, { status: 500 });
	}
}
