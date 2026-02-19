import { ApiClient } from "@mondaydotcomorg/api";
import { supabaseAdmin } from "@/lib/supabase/server";

const WEBHOOK_EVENTS = ["create_item", "create_pulse", "change_name", "item_moved_to_any_group", "item_archived", "item_deleted", "item_restored", "create_subitem", "move_subitem"];

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

		// 1. Get existing webhooks for the board from Monday API
		const getWebhooksQuery = `
			query ($boardId: ID!) {
				webhooks(board_id: $boardId) {
					id
					event
					config
				}
			}
		`;

		const response = await client.request<any>(getWebhooksQuery, { boardId });
		const existingMondayWebhooks = response.data?.data?.webhooks || [];

		// 2. Determine which events need a webhook
		for (const event of WEBHOOK_EVENTS) {
			const alreadyExists = existingMondayWebhooks.some((w: any) => w.event === event && w.config?.url === webhookUrl);

			if (!alreadyExists) {
				console.log(`Registering webhook for event ${event} on board ${boardId}`);

				const createWebhookMutation = `
					mutation ($boardId: ID!, $url: String!, $event: WebhookEventType!) {
						create_webhook (board_id: $boardId, url: $url, event: $event) {
							id
						}
					}
				`;

				const createResponse = await client.request<any>(createWebhookMutation, {
					boardId,
					url: webhookUrl,
					event,
				});

				if (createResponse.error || createResponse.data?.error) {
					console.error(`Failed to register webhook for ${event}:`, createResponse.error || createResponse.data?.error);
					continue;
				}

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
