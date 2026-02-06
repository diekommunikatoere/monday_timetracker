import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMondayJwt } from "@/lib/monday-auth";

/**
 * PATCH /api/timer/draft
 * Auto-save a draft time entry
 */
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

		const { comment, sessionId } = await request.json();

		if (!sessionId) {
			return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
		}

		// 1. Get draft_id from session
		const { data: timerSession, error: sessionError } = await supabaseAdmin.from("timer_session").select("draft_id, user_id").eq("id", sessionId).single();

		if (sessionError || !timerSession) {
			return NextResponse.json({ error: "Session not found" }, { status: 404 });
		}

		// Security check: Ensure the session belongs to the user
		// We need to find the user_profile for the current session.userId (monday_user_id)
		const { data: userProfile } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", session.userId).single();

		if (!userProfile || timerSession.user_id !== userProfile.id) {
			return NextResponse.json({ error: "Forbidden: Session ownership mismatch" }, { status: 403 });
		}

		const draftId = timerSession.draft_id;

		if (draftId) {
			// 2. Update existing draft
			const { error: updateError } = await supabaseAdmin.from("time_entry").update({ comment }).eq("id", draftId).eq("user_id", userProfile.id); // Extra safety

			if (updateError) {
				console.error("Error updating draft:", updateError);
				return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
			}
		} else if (comment?.trim()) {
			// 3. Create new draft if none exists
			const { data: newDraft, error: insertError } = await supabaseAdmin
				.from("time_entry")
				.insert({
					user_id: userProfile.id,
					comment,
					start_time: new Date().toISOString(),
					is_draft: true,
				})
				.select()
				.single();

			if (insertError) {
				console.error("Error creating draft:", insertError);
				return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
			}

			// 4. Link draft to session
			await supabaseAdmin.from("timer_session").update({ draft_id: newDraft.id }).eq("id", sessionId);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error in PATCH /api/timer/draft:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
