import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/monday-auth";
import { createMondayClient } from "@/lib/monday/client";
import { registerBoardWebhooks, WEBHOOK_EVENTS } from "@/lib/monday/webhooks";

/**
 * GET /api/admin/boards/[boardId]/webhooks
 * Report registration status for every expected webhook event on a board:
 * one row per WEBHOOK_EVENTS entry, `id` set if monday currently has it registered
 * for this app, `null` if it's missing.
 * Note: Authentication is handled server-side via requireAdmin
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { boardId } = await params;
		if (!process.env.MONDAY_API_TOKEN) {
			return NextResponse.json({ error: "MONDAY_API_TOKEN is not set" }, { status: 500 });
		}

		const client = createMondayClient();
		const query = `
            query ($boardId: ID!) {
                webhooks (board_id: $boardId, app_webhooks_only: true) {
                    id
                    event
                }
            }
        `;

		const response = await client.request<any>(query, { boardId });

		if (response.error) {
			console.error("Monday API error:", response.error);
			return NextResponse.json({ error: response.error?.message || "Failed to fetch webhooks" }, { status: 500 });
		}

		const liveEventIds = new Map<string, string>();
		for (const webhook of response.webhooks || []) {
			liveEventIds.set(webhook.event, webhook.id?.toString());
		}

		const webhooks = WEBHOOK_EVENTS.map((event) => ({
			event,
			id: liveEventIds.get(event) ?? null,
		}));

		const missingCount = webhooks.filter((w) => !w.id).length;

		return NextResponse.json({ success: true, boardId, webhooks, missingCount });
	} catch (error) {
		console.error("Error in GET /api/admin/boards/[boardId]/webhooks:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * POST /api/admin/boards/[boardId]/webhooks
 * Register any of WEBHOOK_EVENTS that aren't currently set up for this board.
 * Note: Authentication is handled server-side via requireAdmin
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { boardId } = await params;
		const token = process.env.MONDAY_API_TOKEN;
		if (!token) {
			return NextResponse.json({ error: "MONDAY_API_TOKEN is not set" }, { status: 500 });
		}

		await registerBoardWebhooks(boardId, token);

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error in POST /api/admin/boards/[boardId]/webhooks:", error);
		return NextResponse.json({ error: "Failed to register webhooks" }, { status: 500 });
	}
}
