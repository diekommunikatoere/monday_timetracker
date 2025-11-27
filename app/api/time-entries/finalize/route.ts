import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";

interface FinalizeTimeEntryRequest {
	draftId: string;
	taskName: string;
	comment?: string;
	boardId?: string;
	boardName?: string;
	itemId?: string;
	itemName?: string;
	role?: string;
	roleName?: string;
}

export async function POST(request: NextRequest) {
	try {
		// Authenticate user from Monday context
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get the Supabase user ID from the Monday user ID
		const { data: userProfile, error: userError } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();

		if (userError || !userProfile) {
			console.error("Error fetching user profile:", userError);
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Parse request body
		const body: FinalizeTimeEntryRequest = await request.json();
		const { draftId, taskName, comment, boardId, boardName, itemId, itemName, role, roleName } = body;

		// Validate required fields
		if (!draftId) {
			return NextResponse.json({ error: "draftId is required" }, { status: 400 });
		}

		if (!taskName) {
			return NextResponse.json({ error: "taskName is required" }, { status: 400 });
		}

		// Call the RPC to finalize the time entry
		const { data, error } = await supabaseAdmin.rpc("finalize_time_entry", {
			p_user_id: userProfile.id,
			p_draft_id: draftId,
			p_task_name: taskName,
			p_comment: comment || null,
			p_board_id: boardId || null,
			p_board_name: boardName || null,
			p_item_id: itemId || null,
			p_item_name: itemName || null,
			p_role: role || null,
			p_role_name: roleName || null,
		});

		if (error) {
			console.error("Error finalizing time entry:", error);
			return NextResponse.json({ error: error.message || "Failed to finalize time entry" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			data,
		});
	} catch (error) {
		console.error("Error in finalize time entry endpoint:", error);
		return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
	}
}
