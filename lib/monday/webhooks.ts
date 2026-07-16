// lib/monday/webhooks.ts — Registers and reconciles monday.com board webhooks.

import { supabaseAdmin } from "@/lib/supabase/server";
import { createMondayClient } from "./client";

/**
 * monday.com `WebhookEventType` subscription names to register for every tracked board.
 *
 * **Important naming gap**: these are the *subscription* event names sent to monday,
 * which differ from the `event.type` values that appear in the delivered webhook payload.
 * For example, subscribing to `"create_item"` delivers a payload with `type: "create_pulse"`.
 * See `app/api/webhooks/monday/route.ts` for the handler's `switch` on payload event types.
 *
 * **Known coverage gaps** (the cron is the backstop):
 * - Group-only operations (rename, archive, delete group) fire no webhooks.
 * - Moves to boards not tracked by this app fire no webhooks.
 */
const WEBHOOK_EVENTS = ["create_item", "change_name", "item_moved_to_any_group", "item_archived", "item_deleted", "item_restored", "create_subitem", "move_subitem", "change_subitem_name", "subitem_deleted", "subitem_archived"];

/**
 * Registers webhooks for any {@link WEBHOOK_EVENTS} entries not yet recorded in
 * `monday_webhook` for this board + current app URL. Idempotent — already-registered
 * events are skipped.
 *
 * **Dedup strategy**: monday's `webhooks` GraphQL query returns no `url` field, so
 * "already registered" is determined from our own `monday_webhook` DB records filtered
 * by `board_id`, `url`, and `is_active = true` — not from monday directly.
 *
 * Each event is attempted independently so one bad event type doesn't abort the loop.
 * Requires `APP_URL` or `NEXT_PUBLIC_APP_URL` env var; throws if neither is set.
 *
 * @param boardId - monday board ID to register webhooks on.
 * @param token   - monday API token with `webhooks:write` scope.
 * @returns `{ success: true }` when the loop completes (individual event errors are
 *          swallowed and logged, not surfaced in the return value).
 */
export async function registerBoardWebhooks(boardId: string, token: string) {
	try {
		const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
		if (!appUrl) {
			throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is not set");
		}

		const webhookUrl = `${appUrl}/api/webhooks/monday`;
		const client = createMondayClient();

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

				console.log(`Successfully registered webhook for event ${event} on board ${boardId}:`, JSON.stringify(createResponse));

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
 * Reconciles a board's live monday webhooks to exactly **one current-URL webhook per
 * desired event**. Intended to be called by the `/api/cron/sync-boards?reconcile=true`
 * route to prune stale registrations that accumulate when the app URL changes or
 * webhooks are registered more than once.
 *
 * Deletes from monday and `monday_webhook`:
 * - Webhooks for events no longer in {@link WEBHOOK_EVENTS} (stale event types).
 * - Duplicate webhooks for desired events (keeps the first current-URL one).
 * - Webhooks pointing at old URLs (any ID not in our DB as the current URL).
 *
 * After pruning, calls {@link registerBoardWebhooks} to recreate any desired events
 * that ended up with no current-URL webhook.
 *
 * monday's `webhooks` query returns no `url` field — "current URL" is determined from
 * our `monday_webhook` DB records. Requires `APP_URL` or `NEXT_PUBLIC_APP_URL`; throws
 * if neither is set.
 *
 * @param boardId - monday board ID to reconcile.
 * @param token   - monday API token with `webhooks:write` scope.
 * @returns `{ success: true, deleted: number }` where `deleted` is the number of
 *          webhooks removed from monday (individual delete errors are swallowed and
 *          logged, not counted).
 */
export async function reconcileWebhooks(boardId: string, token: string) {
	try {
		const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
		if (!appUrl) {
			throw new Error("APP_URL or NEXT_PUBLIC_APP_URL is not set");
		}

		const webhookUrl = `${appUrl}/api/webhooks/monday`;
		const client = createMondayClient();

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
