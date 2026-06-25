import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getItemDetails } from "@/lib/monday";
import { syncItemColumns } from "@/lib/columnSync";

/**
 * After an item is trashed or restored, the parent item's budget/time columns in
 * Monday are stale until something re-pushes them. Trigger that re-sync.
 * - Subitem: syncItemColumns redirects to and re-pushes the parent's columns.
 * - Top-level item: only on restore (includeSelf) — a trashed top-level item is
 *   gone from Monday, so there's no column to update.
 * A subitem's stored board_id is its parent's board, which is what the sync needs.
 */
async function resyncItemBudget(itemId: string | undefined, includeSelf: boolean): Promise<void> {
	if (!itemId) return;

	const { data: row } = await supabaseAdmin.from("monday_item").select("parent_item_id, board_id").eq("id", itemId).maybeSingle();
	if (!row?.board_id) return;

	const targetItemId = row.parent_item_id || (includeSelf ? itemId : null);
	if (!targetItemId) return;

	try {
		await syncItemColumns(targetItemId, row.board_id, "webhook:monday-lifecycle");
	} catch (error) {
		console.error(`[webhook] Failed to re-sync budget for item ${targetItemId}:`, error);
	}
}

/**
 * Resolves the parent item's board_id and group_id using:
 * 1. Event payload fields
 * 2. DB lookup on monday_item
 * 3. Monday API fallback (also upserts parent to DB)
 */
async function resolveParentInfo(parentItemId: string, eventData?: { parentItemBoardId?: string; boardId?: string }): Promise<{ boardId: string | null; groupId: string | null }> {
	// 1. Try event payload
	if (eventData?.parentItemBoardId) {
		// We have the board from the event, but still need group — try DB
		const { data: dbItem } = await supabaseAdmin.from("monday_item").select("board_id, group_id").eq("id", parentItemId).single();

		if (dbItem?.group_id) {
			return { boardId: eventData.parentItemBoardId, groupId: dbItem.group_id };
		}
	}

	// 2. Try DB lookup
	const { data: dbItem } = await supabaseAdmin.from("monday_item").select("board_id, group_id").eq("id", parentItemId).single();

	if (dbItem?.board_id && dbItem?.group_id) {
		return { boardId: dbItem.board_id, groupId: dbItem.group_id };
	}

	// 3. API fallback — also upsert parent into DB for future lookups
	const parentDetails = await getItemDetails(parentItemId);
	if (parentDetails) {
		await supabaseAdmin.from("monday_item").upsert({
			id: parentDetails.id,
			board_id: parentDetails.boardId,
			group_id: parentDetails.groupId,
			name: parentDetails.name || "Unnamed Item",
			is_active: true,
			updated_at: new Date().toISOString(),
		});
		return { boardId: parentDetails.boardId, groupId: parentDetails.groupId };
	}

	return { boardId: null, groupId: null };
}

/**
 * POST /api/webhooks/monday
 * Single endpoint for all monday.com webhook events.
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();

		// TEMP DEBUG — remove after confirming Monday's auth header shape
		console.log("[webhook] request:", JSON.stringify(body));

		// 1. Handle monday.com verification challenge
		if (body.challenge) {
			return NextResponse.json(body);
		}

		// 2. Parse event data
		const { event } = body;
		if (!event) {
			return NextResponse.json({ error: "No event data found" }, { status: 400 });
		}

		const eventType = event.type;

		console.log(`Received monday webhook: ${eventType} for board ${event.boardId || event.sourceBoardId}, item ${event.itemId || event.pulseId || event.subitem}`);
		console.log("Full event data:", JSON.stringify(event));

		// 3. Handle different event types
		switch (eventType) {
			case "create_pulse": {
				const { groupId, pulseName } = event;
				const itemId = (event.pulseId || event.itemId).toString();

				// Query API to detect if subitem (monday sends create_pulse for both)
				const itemDetails = await getItemDetails(itemId);
				const parentItemId = itemDetails?.parentItemId || null;

				let effectiveBoardId: string | null;
				let effectiveGroupId: string | null | undefined;

				if (parentItemId) {
					// Subitem: resolve parent's board_id and group_id
					const parentInfo = await resolveParentInfo(parentItemId, event);
					effectiveBoardId = parentInfo.boardId || itemDetails?.parentBoardId || event.boardId;
					effectiveGroupId = parentInfo.groupId || itemDetails?.parentGroupId;
				} else {
					// Regular item: use event data directly
					effectiveBoardId = event.boardId || itemDetails?.boardId;
					effectiveGroupId = groupId?.toString();
				}

				await supabaseAdmin.from("monday_item").upsert({
					id: itemId,
					board_id: effectiveBoardId,
					group_id: effectiveGroupId,
					parent_item_id: parentItemId,
					name: pulseName || itemDetails?.name || "Unnamed Item",
					is_active: true,
					updated_at: new Date().toISOString(),
				});
				break;
			}

			case "update_name": {
				const { value } = event;
				await supabaseAdmin
					.from("monday_item")
					.update({
						name: value?.name || "Unnamed Item",
						updated_at: new Date().toISOString(),
					})
					.eq("id", event.pulseId?.toString());
				break;
			}

			case "move_pulse_into_group": {
				const { destGroupId } = event;
				const movedItemId = event.pulseId?.toString();
				const newGroupId = destGroupId?.toString();

				// Update the parent item's group
				await supabaseAdmin
					.from("monday_item")
					.update({
						group_id: newGroupId,
						updated_at: new Date().toISOString(),
					})
					.eq("id", movedItemId);

				// Cascade group_id to all subitems of this parent
				await supabaseAdmin
					.from("monday_item")
					.update({
						group_id: newGroupId,
						updated_at: new Date().toISOString(),
					})
					.eq("parent_item_id", movedItemId);
				break;
			}

			case "move_pulse_into_board": {
				// Fires when an item moves to another (tracked) board, and also when a
				// subitem is converted to an item. board_id and group_id both change;
				// clearing parent_item_id handles the subitem->item conversion case.
				const movedItemId = event.pulseId?.toString();
				const newBoardId = event.boardId?.toString();
				const newGroupId = event.destGroupId?.toString();
				const now = new Date().toISOString();

				await supabaseAdmin
					.from("monday_item")
					.update({
						board_id: newBoardId,
						group_id: newGroupId,
						parent_item_id: null,
						updated_at: now,
					})
					.eq("id", movedItemId);

				// Subitems follow their parent to the new board and group.
				await supabaseAdmin
					.from("monday_item")
					.update({
						board_id: newBoardId,
						group_id: newGroupId,
						updated_at: now,
					})
					.eq("parent_item_id", movedItemId);
				break;
			}

			case "delete_pulse": {
				// Soft-delete: Monday keeps trashed items restorable for 30 days, and a
				// hard delete would orphan time entries (item_id ON DELETE SET NULL).
				// Item-delete payloads carry itemId; subitem-delete payloads carry both.
				const deletedItemId = (event.itemId || event.pulseId)?.toString();
				const trashedAt = new Date().toISOString();

				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						deleted_at: trashedAt,
						updated_at: trashedAt,
					})
					.eq("id", deletedItemId);

				// Monday sends no events for a deleted item's subitems, so cascade the
				// trash to them. Only touch ones not already trashed.
				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						deleted_at: trashedAt,
						updated_at: trashedAt,
					})
					.eq("parent_item_id", deletedItemId)
					.is("deleted_at", null);

				// Re-push the parent's budget column now that this item's time is excluded.
				await resyncItemBudget(deletedItemId, false);
				break;
			}

			case "archive_pulse": {
				const archivedItemId = (event.itemId || event.pulseId)?.toString();

				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						updated_at: new Date().toISOString(),
					})
					.eq("id", archivedItemId);

				// Archiving a parent archives its subitems too, with no separate events.
				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						updated_at: new Date().toISOString(),
					})
					.eq("parent_item_id", archivedItemId);
				break;
			}

			case "restore_pulse": {
				// Clears both archive and trash state. Monday emits a separate
				// restore_pulse per item/subitem, so we don't cascade here.
				const restoredItemId = (event.itemId || event.pulseId)?.toString();

				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: true,
						deleted_at: null,
						updated_at: new Date().toISOString(),
					})
					.eq("id", restoredItemId);

				// Re-push budget now that this item's time counts again (parent for a
				// subitem; the item itself for a restored top-level item).
				await resyncItemBudget(restoredItemId, true);
				break;
			}

			case "move_subitem": {
				// Subitems inherit group_id from their parent
				const newParentItemId = event.destPulseId?.toString() || null;
				const newParentDetails = await getItemDetails(newParentItemId);
				const newGroupId = newParentDetails?.groupId || null;

				await supabaseAdmin
					.from("monday_item")
					.update({
						parent_item_id: newParentItemId,
						group_id: newGroupId,
						updated_at: new Date().toISOString(),
					})
					.eq("id", event.subitem?.toString());
				break;
			}

			default:
				console.log(`Unhandled webhook event type: ${eventType}`);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error in monday webhook handler:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
