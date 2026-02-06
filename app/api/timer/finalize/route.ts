import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMondayJwt } from "@/lib/monday-auth";

/**
 * POST /api/timer/finalize
 * Finalize a draft time entry
 */
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

		const { draftId, taskName, comment } = await request.json();

		if (!draftId) {
			return NextResponse.json({ error: "Missing draftId" }, { status: 400 });
		}

		// Get user profile
		const { data: userProfile } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", session.userId).single();

		if (!userProfile) {
			return NextResponse.json({ error: "User profile not found" }, { status: 404 });
		}

		const finalTaskName = taskName && taskName.trim() ? taskName : "Unzugeordneter Zeiteintrag";

		// Call RPC with supabaseAdmin
		const { data, error } = await supabaseAdmin.rpc("finalize_draft", {
			p_user_id: userProfile.id,
			p_draft_id: draftId,
			p_task_name: finalTaskName,
			p_comment: comment,
		});

		if (error) {
			console.error("Error finalizing draft via RPC:", error);
			return NextResponse.json({ error: error.message }, { status: 500 });
		}

		return NextResponse.json({ success: true, data });
	} catch (error) {
		console.error("Error in POST /api/timer/finalize:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
