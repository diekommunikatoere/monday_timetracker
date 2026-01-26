import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncAfterFinalize } from "@/lib/columnSync";
import { roundDuration } from "@/lib/utils";

interface FinalizeTimeEntryRequest {
	draftId: string;
	taskName: string;
	comment?: string;
	boardId?: string;
	boardName?: string;
	itemId?: string;
	itemName?: string;
	parentItemId?: string;
	parentItemName?: string;
	roleId?: string;
	duration?: number; // in seconds, optional override
	date?: string; // ISO date string, optional override
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
		const { draftId, taskName, comment, boardId, boardName, itemId, itemName, parentItemId, parentItemName, roleId, duration, date } = body;

		// Validate required fields
		if (!draftId) {
			return NextResponse.json({ error: "draftId is required" }, { status: 400 });
		}

		if (!taskName) {
			return NextResponse.json({ error: "taskName is required" }, { status: 400 });
		}

		// If duration and date are provided, update the draft entry first
		if (duration !== undefined || date !== undefined) {
			// Get the current draft to calculate new timestamps
			const { data: draft, error: draftError } = await supabaseAdmin.from("time_entry").select("start_time, duration").eq("id", draftId).single();

			if (draftError || !draft) {
				console.error("Error fetching draft:", draftError);
				return NextResponse.json({ error: "Draft not found" }, { status: 404 });
			}

			// Calculate new timestamps
			const rawDuration = duration !== undefined ? duration : draft.duration;
			const newDuration = roundDuration(rawDuration);
			const newStartTime = date ? new Date(date).toISOString() : draft.start_time;
			const newEndTime = new Date(new Date(newStartTime).getTime() + newDuration * 1000).toISOString();

			// Update the draft with new duration and timestamps
			const { error: updateError } = await supabaseAdmin
				.from("time_entry")
				.update({
					duration: newDuration,
					start_time: newStartTime,
					end_time: newEndTime,
				})
				.eq("id", draftId);

			if (updateError) {
				console.error("Error updating draft:", updateError);
				return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
			}
		}

		console.log("Finalizing time entry with: ", { draftId, taskName, comment, boardId, boardName, itemId, itemName, parentItemId, parentItemName, roleId, duration, date });

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
			p_parent_item_id: parentItemId || null,
			p_parent_item_name: parentItemName || null,
			p_role_id: roleId || null,
			p_duration: duration, // Pass the duration override
			p_date: date ? new Date(date).toISOString() : null, // Pass the date override
		} as any);

		if (error) {
			console.error("Error finalizing time entry:", error);
			return NextResponse.json({ error: error.message || "Failed to finalize time entry" }, { status: 500 });
		}

		// Trigger column sync after successful finalization
		// This runs asynchronously and doesn't block the response
		if (boardId && itemId) {
			// Don't await - let it run in the background
			syncAfterFinalize(itemId, boardId, userProfile.id, draftId).catch((syncError) => {
				console.error("[ColumnSync] Background sync failed:", syncError);
			});
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
