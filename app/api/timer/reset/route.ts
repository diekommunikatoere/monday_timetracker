import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
	try {
		// Authenticate user
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const { data: userId } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();

		const body = await request.json();
		const { draftId, sessionId } = body;

		if (!draftId || !sessionId) {
			return NextResponse.json({ error: "draftId and sessionId are required" }, { status: 400 });
		}

		// Delete timer_session first (cascades to timer_segments)
		const { error: sessionError } = await supabaseAdmin.from("timer_session").delete().eq("id", sessionId).eq("user_id", userId.id);

		if (sessionError) throw sessionError;

		// Then delete draft time_entry
		const { error: draftError } = await supabaseAdmin.from("time_entry").delete().eq("id", draftId).eq("user_id", userId.id);

		if (draftError) throw draftError;

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error resetting timer:", error);
		return NextResponse.json({ error: "Failed to reset timer" }, { status: 500 });
	}
}
