import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncAfterFinalize } from "@/lib/columnSync";
import { roundDuration } from "@/lib/utils";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";
import { cacheHelper } from "@/lib/redis";

interface FinalizeTimeEntryRequest {
	draftId: string;
	taskName: string;
	comment?: string;
	boardId: string;
	boardName?: string;
	itemId: string;
	itemName?: string;
	parentItemId?: string;
	parentItemName?: string;
	roleId: string;
	duration: number; // in seconds, optional override
	date: string; // ISO date string, optional override
	startTime: string; // ISO date-time string (preferred)
	endTime: string; // ISO date-time string (preferred)
}

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
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		// Parse request body
		const body: FinalizeTimeEntryRequest = await request.json();
		const { draftId, taskName, comment, boardId, boardName, itemId, itemName, parentItemId, parentItemName, roleId, duration, date, startTime, endTime } = body;

		// Validate required fields
		if (!draftId) {
			return NextResponse.json({ error: "draftId is required" }, { status: 400 });
		}

		if (!taskName || !boardId || !itemId) {
			return NextResponse.json({ error: "Ungültige Aufgaben- oder Board-ID." }, { status: 400 });
		}

		if (!roleId) {
			return NextResponse.json({ error: "Ungültige Rollen-ID." }, { status: 400 });
		}

		// If duration and date are provided, update the draft entry first
		if (duration !== undefined || date !== undefined || startTime || endTime) {
			// Get the current draft to calculate new timestamps
			const { data: draft, error: draftError } = await supabaseAdmin.from("time_entry").select("start_time, duration").eq("id", draftId).single();

			if (draftError || !draft) {
				console.error("Error fetching draft:", draftError);
				return NextResponse.json({ error: "Draft not found" }, { status: 404 });
			}

			// Calculate new timestamps
			const rawDuration = duration !== undefined ? duration : draft.duration;
			const newDuration = roundDuration(rawDuration);

			let finalStartTime: string;
			let finalEndTime: string;

			if (startTime && endTime) {
				finalStartTime = new Date(startTime).toISOString();
				finalEndTime = new Date(endTime).toISOString();
			} else {
				finalStartTime = date ? new Date(date).toISOString() : draft.start_time;
				finalEndTime = new Date(new Date(finalStartTime).getTime() + newDuration * 1000).toISOString();
			}

			// Update the draft with new duration and timestamps
			const { error: updateError } = await supabaseAdmin
				.from("time_entry")
				.update({
					duration: newDuration,
					start_time: finalStartTime,
					end_time: finalEndTime,
				})
				.eq("id", draftId)
				.eq("user_id", userProfile.id);

			if (updateError) {
				console.error("Error updating draft:", updateError);
				return NextResponse.json({ error: "Failed to update draft" }, { status: 500 });
			}
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
			p_parent_item_id: parentItemId || null,
			p_parent_item_name: parentItemName || null,
			p_role_id: roleId || null,
			p_duration: duration, // Pass the duration override
			p_date: date ? new Date(date).toISOString() : null, // Pass the date override
			p_start_time: startTime ? new Date(startTime).toISOString() : null, // Honor the exact start the user saw
			p_end_time: endTime ? new Date(endTime).toISOString() : null, // Honor the exact end the user saw
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

		// Invalidate relevant cache keys
		await cacheHelper.del(`time_entry:${draftId}`);
		await cacheHelper.clearPattern("time_entry:*");

		return NextResponse.json({
			success: true,
			data,
		});
	} catch (error) {
		console.error("Error in finalize time entry endpoint:", error);
		return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
	}
}
