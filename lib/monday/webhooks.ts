import { ApiClient } from "@mondaydotcomorg/api";
import { supabaseAdmin } from "@/lib/supabase/server";

// Valid Monday `WebhookEventType` enum values to subscribe to. Note these are the
// *subscription* names, which differ from the `event.type` names in delivered payloads
// (e.g. subscribing to `create_item` delivers an event with type `create_pulse`).
const WEBHOOK_EVENTS = ["create_item", "change_name", "item_moved_to_any_group", "item_archived", "item_deleted", "item_restored", "create_subitem", "move_subitem", "change_subitem_name", "subitem_deleted", "subitem_archived"];

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
 * Reconciles a board's live Monday webhooks to exactly one current-url webhook
 * per desired event. Deletes:
 *   - webhooks for events no longer in WEBHOOK_EVENTS (stale events), and
 *   - webhooks for desired events that aren't our current-url one (old urls and
 *     duplicates) — registerBoardWebhooks then recreates the canonical one.
 *
 * Monday's `webhooks` query doesn't return the target url, so "current url" is
 * determined from our own `monday_webhook` records.
 * @param boardId The ID of the board to reconcile.
 * @param token The Monday API token.
 */
export async function reconcileWebhooks(boardId: string, token: string) {
	try {
		const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
		if (!appUrl) {
			throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is not set");
		}

		const webhookUrl = `${appUrl}/api/webhooks/monday`;
		const client = new ApiClient({ token, apiVersion: "2025-10" });

		// 1. Live webhooks on the board (no url is returned here).
		const getWebhooksQuery = `
			query ($boardId: ID!) {
				webhooks(board_id: $boardId) {
					id
					event
				}
			}
		`;

		const response = await client.request<any>(getWebhooksQuery, { boardId });
		const liveWebhooks: Array<{ id: string | number; event: string }> = response.data?.data?.webhooks || [];

		// 2. Our records — only these tell us which ids point at the current url.
		const { data: dbWebhooks } = await supabaseAdmin.from("monday_webhook").select("id, url").eq("board_id", boardId);

		const currentUrlIds = new Set((dbWebhooks || []).filter((w) => w.url === webhookUrl).map((w) => w.id));

		// 3. Keep exactly one current-url webhook per desired event; delete the rest.
		const keptEvents = new Set<string>();
		const toDelete: string[] = [];

		for (const wh of liveWebhooks) {
			const id = wh.id.toString();
			const isDesiredAndCurrent = WEBHOOK_EVENTS.includes(wh.event) && currentUrlIds.has(id);

			if (isDesiredAndCurrent && !keptEvents.has(wh.event)) {
				keptEvents.add(wh.event);
				continue;
			}
			toDelete.push(id);
		}

		// 4. Delete the rejects from Monday and our DB.
		const deleteWebhookMutation = `
			mutation ($id: ID!) {
				delete_webhook (id: $id) {
					id
				}
			}
		`;

		for (const id of toDelete) {
			try {
				await client.request<any>(deleteWebhookMutation, { id });
				await supabaseAdmin.from("monday_webhook").delete().eq("id", id);
				console.log(`[reconcileWebhooks] Deleted webhook ${id} on board ${boardId}`);
			} catch (deleteError) {
				console.error(`[reconcileWebhooks] Failed to delete webhook ${id} on board ${boardId}:`, deleteError);
			}
		}

		// 5. Recreate any desired event left without a current-url webhook.
		await registerBoardWebhooks(boardId, token);

		return { success: true, deleted: toDelete.length };
	} catch (error) {
		console.error(`Error in reconcileWebhooks for board ${boardId}:`, error);
		throw error;
	}
}
