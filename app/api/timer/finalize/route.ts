// POST /api/timer/finalize — promote a running/paused/parked timer into a durable,
// finalized time entry (or, with asDraft, keep it parked while still applying the
// explicit time window and an optional role). Single atomic RPC (timer_finalize)
// that closes the open segment, honors the explicit start/end the user saw in the
// Save modal, applies the 1–59s→60s rounding, bootstraps any missing monday
// dimension rows, and sets timer_state — no separate soft-reset/session cleanup
// needed.
//
// timer_finalize consolidates the legacy finalize_time_entry + finalize_draft RPCs.
// Column sync (write-back to monday) and Redis cache invalidation are TS-side concerns
// the RPC does not handle, so they stay here — and are skipped entirely for asDraft,
// since a parked row doesn't feed monday totals.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncAfterFinalize } from "@/lib/columnSync";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";
import { cacheHelper } from "@/lib/redis";

interface FinalizeRequest {
	entryId: string;
	taskName?: string;
	comment?: string;
	boardId?: string;
	boardName?: string;
	itemId?: string;
	itemName?: string;
	parentItemId?: string;
	parentItemName?: string;
	roleId?: string;
	duration?: number; // seconds (override)
	startTime?: string; // ISO 8601 — the exact start the user saw/edited
	endTime?: string; // ISO 8601 — the exact end the user saw/edited
	/** When true, keep the entry `parked` instead of promoting it to `finalized`; board/item/role become optional. */
	asDraft?: boolean;
}

export async function POST(request: NextRequest) {
	try {
		// Validate session
		const authHeader = request.headers.get("authorization");
		console.log("[API /timer/finalize] Received finalize request.");
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

		const body: FinalizeRequest = await request.json().catch(() => ({}) as FinalizeRequest);
		const { entryId, taskName, comment, boardId, boardName, itemId, itemName, parentItemId, parentItemName, roleId, duration, startTime, endTime, asDraft } = body;

		if (!entryId) {
			return NextResponse.json({ error: "Missing entryId in request body" }, { status: 400 });
		}
		if (!asDraft) {
			if (!boardId || !itemId) {
				return NextResponse.json({ error: "Ungültige Aufgaben- oder Board-ID." }, { status: 400 });
			}
			if (!roleId) {
				return NextResponse.json({ error: "Ungültige Rollen-ID." }, { status: 400 });
			}
		}

		// p_task_name is accepted for call-site parity; the RPC derives the name from monday_item.
		const finalTaskName = taskName && taskName.trim() ? taskName : "Unzugeordneter Zeiteintrag";

		const { data: entry, error } = await supabaseAdmin.rpc("timer_finalize", {
			p_user_id: userProfile.id,
			p_entry_id: entryId,
			p_task_name: finalTaskName,
			p_comment: comment ?? undefined,
			p_board_id: boardId ?? undefined,
			p_board_name: boardName ?? undefined,
			p_item_id: itemId ?? undefined,
			p_item_name: itemName ?? undefined,
			p_parent_item_id: parentItemId ?? undefined,
			p_parent_item_name: parentItemName ?? undefined,
			p_role_id: roleId ?? undefined,
			p_duration: duration ?? undefined,
			p_start_time: startTime ?? undefined,
			p_end_time: endTime ?? undefined,
			p_keep_draft: asDraft ?? false,
		});

		if (error) {
			console.error("[API /timer/finalize] Error finalizing via RPC:", error);
			return NextResponse.json({ error: error.message || "Failed to finalize timer" }, { status: 500 });
		}

		// Write-back to monday — fire-and-forget so it doesn't block the response. A
		// parked draft carries no guaranteed board/item and shouldn't feed monday totals.
		if (!asDraft && boardId && itemId) {
			syncAfterFinalize(itemId, boardId, userProfile.id, entryId).catch((syncError) => {
				console.error("[ColumnSync] Background sync after finalize failed:", syncError);
			});
		}

		// Invalidate the time-entry caches so the finalized row reads fresh.
		await cacheHelper.del(`time_entry:${entryId}`);
		await cacheHelper.clearPattern("time_entry:*");

		return NextResponse.json({ success: true, entry });
	} catch (error) {
		console.error("[API /timer/finalize] Error in POST /api/timer/finalize:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
