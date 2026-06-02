import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getItemDetails } from "@/lib/monday";

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

			case "delete_pulse": {
				await supabaseAdmin.from("monday_item").delete().eq("id", event.pulseId?.toString());
				break;
			}

			case "archive_pulse": {
				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						updated_at: new Date().toISOString(),
					})
					.eq("id", event.pulseId?.toString());
				break;
			}

			case "restore_pulse": {
				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: true,
						updated_at: new Date().toISOString(),
					})
					.eq("id", event.itemId?.toString());
				break;
			}

			case "create_subitem":
			case "create_subpulse": {
				const { parentItemId: subParentId, pulseName } = event;
				const subParentItemId = subParentId?.toString();

				// Resolve parent's board_id and group_id (not the subitems board)
				const parentInfo = subParentItemId ? await resolveParentInfo(subParentItemId, event) : { boardId: event.boardId, groupId: null };

				await supabaseAdmin.from("monday_item").upsert({
					id: event.itemId.toString(),
					board_id: parentInfo.boardId || event.boardId,
					group_id: parentInfo.groupId,
					parent_item_id: subParentItemId,
					name: pulseName || "Unnamed Subitem",
					is_active: true,
					updated_at: new Date().toISOString(),
				});
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

			case "change_subitem_name": {
				const { value } = event;
				await supabaseAdmin
					.from("monday_item")
					.update({
						name: value?.name || "Unnamed Subitem",
						updated_at: new Date().toISOString(),
					})
					.eq("id", event.itemId?.toString());
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
