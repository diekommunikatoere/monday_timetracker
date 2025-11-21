import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pauseTimer, resumeTimer } from "@/lib/database";

export async function POST(request: NextRequest) {
	try {
		console.log("Received pause/resume timer request");
		// Authenticate user
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const { data: userId } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();

		const { sessionId, elapsedTime, isPausing } = await request.json();

		if (!sessionId) {
			return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
		}

		if (isPausing) {
			await pauseTimer(sessionId, userId.id);
			return NextResponse.json({ success: true, paused: true });
		} else {
			await resumeTimer(sessionId, userId.id);
			return NextResponse.json({ success: true, paused: false });
		}
	} catch (error) {
		console.error("Error pausing timer:", error);
		return NextResponse.json({ error: "Failed to pause timer" }, { status: 500 });
	}
}
