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

		console.log(`Received monday webhook: ${eventType} for board ${event.boardId || event.sourceBoardId}, item ${event.itemId || event.pulseId || event.subitem}`);
		console.log("Full event data:", JSON.stringify(event));

		// 3. Handle different event types
		switch (eventType) {
			case "create_pulse": {
				const { groupId, pulseName } = event;

				// Query API to detect if subitem (monday sends create_pulse for both)
				const itemDetails = await getItemDetails(event.itemId.toString());
				const parentItemId = itemDetails?.parentItemId || null;

				// Subitems use parent's group_id; regular items use event's groupId
				const effectiveGroupId = parentItemId ? itemDetails?.parentGroupId : groupId?.toString();

				await supabaseAdmin.from("monday_item").upsert({
					id: event.itemId.toString(),
					board_id: event.boardId,
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
				await supabaseAdmin
					.from("monday_item")
					.update({
						group_id: destGroupId?.toString(),
						updated_at: new Date().toISOString(),
					})
					.eq("id", event.itemId?.toString());
				break;
			}

			case "delete_pulse": {
				await supabaseAdmin.from("monday_item").delete().eq("id", event.itemId?.toString());
				break;
			}

			case "archive_pulse": {
				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						updated_at: new Date().toISOString(),
					})
					.eq("id", event.itemId?.toString());
				break;
			}

			case "item_restored": {
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
				const { parentItemId, pulseName } = event;
				await supabaseAdmin.from("monday_item").upsert({
					id: event.itemId.toString(),
					board_id: event.boardId,
					parent_item_id: parentItemId?.toString(),
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
