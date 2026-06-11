import { ApiClient } from "@mondaydotcomorg/api";
import { supabaseAdmin } from "@/lib/supabase/server";

// Valid Monday `WebhookEventType` enum values to subscribe to. Note these are the
// *subscription* names, which differ from the `event.type` names in delivered payloads
// (e.g. subscribing to `create_item` delivers an event with type `create_pulse`).
const WEBHOOK_EVENTS = ["create_item", "change_name", "item_moved_to_any_group", "item_archived", "item_deleted", "item_restored", "create_subitem", "move_subitem", "change_subitem_name"];

/**
 * Registers missing webhooks for a board.
 * @param boardId The ID of the board to register webhooks for.
 * @param token The Monday API token.
 */
export async function registerBoardWebhooks(boardId: string, token: string) {
	try {
		const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
		if (!appUrl) {
			throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is not set");
		}

		const webhookUrl = `${appUrl}/api/webhooks/monday`;
		const client = new ApiClient({ token, apiVersion: "2025-10" });

		// 1. Determine which events we've already registered for this board+url.
		// Monday's `webhooks` query never returns the target url, so we dedup against
		// our own records, which do store it.
		const { data: dbWebhooks } = await supabaseAdmin.from("monday_webhook").select("event").eq("board_id", boardId).eq("url", webhookUrl).eq("is_active", true);

		const registeredEvents = new Set(dbWebhooks?.map((w) => w.event) || []);

		// 2. Register any missing events. Each event is isolated so one failure
		// (e.g. an invalid event type) doesn't abort the rest of the loop.
		const createWebhookMutation = `
			mutation ($boardId: ID!, $url: String!, $event: WebhookEventType!) {
				create_webhook (board_id: $boardId, url: $url, event: $event) {
					id
				}
			}
		`;

		for (const event of WEBHOOK_EVENTS) {
			if (registeredEvents.has(event)) {
				continue;
			}

			console.log(`Registering webhook for event ${event} on board ${boardId}`);

			try {
				const createResponse = await client.request<any>(createWebhookMutation, {
					boardId,
					url: webhookUrl,
					event,
				});

				const webhookId = createResponse.data?.data?.create_webhook?.id;
				if (webhookId) {
					// 3. Store in DB
					await supabaseAdmin.from("monday_webhook").upsert({
						id: webhookId.toString(),
						board_id: boardId,
						event,
						url: webhookUrl,
						is_active: true,
					});
				}
			} catch (eventError) {
				console.error(`Failed to register webhook for ${event} on board ${boardId}:`, eventError);
			}
		}

		return { success: true };
	} catch (error) {
		console.error(`Error in registerBoardWebhooks for board ${boardId}:`, error);
		throw error;
	}
}

/**
 * Verifies and cleans up webhooks in DB against Monday API.
 * (To be used in reconciliation cron)
 */
export async function reconcileWebhooks(boardId: string, token: string) {
	// Implementation for Phase 5
}
