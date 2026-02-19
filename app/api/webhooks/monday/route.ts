import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getItemDetails } from "@/lib/monday";

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
		const boardId = event.boardId?.toString();
		const itemId = event.itemId?.toString() || event.pulseId?.toString();

		console.log(`Received monday webhook: ${eventType} for board ${boardId}, item ${itemId}`);

		// 3. Handle different event types
		switch (eventType) {
			case "create_item":
			case "create_pulse": {
				const { groupId, pulseName } = event;

				// Query API to detect if subitem (monday sends create_pulse for both)
				const itemDetails = await getItemDetails(itemId);
				const parentItemId = itemDetails?.parentItemId || null;

				// Subitems use parent's group_id; regular items use event's groupId
				const effectiveGroupId = parentItemId ? itemDetails?.parentGroupId : groupId?.toString();

				await supabaseAdmin.from("monday_item").upsert({
					id: itemId,
					board_id: boardId,
					group_id: effectiveGroupId,
					parent_item_id: parentItemId,
					name: pulseName || itemDetails?.name || "Unnamed Item",
					is_active: true,
					updated_at: new Date().toISOString(),
				});
				break;
			}

			case "change_name": {
				const { value } = event;
				await supabaseAdmin
					.from("monday_item")
					.update({
						name: value?.name || "Unnamed Item",
						updated_at: new Date().toISOString(),
					})
					.eq("id", itemId);
				break;
			}

			case "move_pulse_into_group": {
				const { destGroupId } = event;
				await supabaseAdmin
					.from("monday_item")
					.update({
						group_id: destGroupId?.toString(),
						updated_at: new Date().toISOString(),
					})
					.eq("id", itemId);
				break;
			}

			case "delete_pulse": {
				await supabaseAdmin.from("monday_item").delete().eq("id", itemId);
				break;
			}

			case "item_archived": {
				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						updated_at: new Date().toISOString(),
					})
					.eq("id", itemId);
				break;
			}

			case "item_restored": {
				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: true,
						updated_at: new Date().toISOString(),
					})
					.eq("id", itemId);
				break;
			}

			case "create_subitem":
			case "create_subpulse": {
				const { parentItemId, pulseName } = event;
				await supabaseAdmin.from("monday_item").upsert({
					id: itemId,
					board_id: boardId,
					parent_item_id: parentItemId?.toString(),
					name: pulseName || "Unnamed Subitem",
					is_active: true,
					updated_at: new Date().toISOString(),
				});
				break;
			}

			case "move_subitem": {
				// Call API to get updated parent/group info after the move
				const itemDetails = await getItemDetails(itemId);
				const newParentItemId = itemDetails?.parentItemId || null;
				// Subitems inherit group_id from their parent
				const newGroupId = itemDetails?.parentGroupId || null;

				await supabaseAdmin
					.from("monday_item")
					.update({
						parent_item_id: newParentItemId,
						group_id: newGroupId,
						updated_at: new Date().toISOString(),
					})
					.eq("id", itemId);
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
					.eq("id", itemId);
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
