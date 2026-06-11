import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getBoardTasks } from "@/lib/monday";
import { registerBoardWebhooks, reconcileWebhooks } from "@/lib/monday/webhooks";
import { upsertMondayItemsBatch } from "@/lib/database";
import { ApiClient } from "@mondaydotcomorg/api";

/**
 * GET /api/cron/sync-boards
 * Reconciliation cron to keep DB in sync with Monday API.
 * Runs every 30 minutes.
 */
export async function GET(request: NextRequest) {
	try {
		// 1. Verify cron secret (if set)
		const authHeader = request.headers.get("authorization");
		const cronSecret = process.env.CRON_SECRET;
		if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Opt-in: `?reconcile=true` deletes stale/duplicate webhooks before
		// re-registering, instead of the default register-missing-only behavior.
		const reconcile = request.nextUrl.searchParams.get("reconcile") === "true";

		const token = process.env.MONDAY_API_TOKEN;
		if (!token) {
			throw new Error("MONDAY_API_TOKEN is not set");
		}

		// 2. Fetch boards that have been active recently (e.g., have time entries or were configured)
		// For this implementation, we'll sync boards that are already in our monday_board table
		const { data: boards, error: boardsError } = await supabaseAdmin.from("monday_board").select("id, name");

		if (boardsError) {
			throw boardsError;
		}

		console.log(`[Reconciliation Cron] Starting sync for ${boards?.length || 0} boards`);

		const results = [];

		for (const board of boards || []) {
			try {
				console.log(`[Reconciliation Cron] Syncing board: ${board.name} (${board.id})`);

				// A. Sync Board Metadata & Webhooks
				const client = new ApiClient({ token, apiVersion: "2025-04" });
				const boardQuery = `
					query ($boardId: ID!) {
						boards(ids: [$boardId]) {
							id
							name
							workspace_id
							board_kind
							state
							groups {
								id
								title
								position
								color
							}
						}
					}
				`;

				const boardResponse = await client.request<any>(boardQuery, { boardId: board.id });
				const mondayBoard = boardResponse.data?.data?.boards?.[0];

				if (mondayBoard) {
					// Update metadata
					await supabaseAdmin.from("monday_board").upsert({
						id: board.id,
						name: mondayBoard.name,
						workspace_id: mondayBoard.workspace_id?.toString(),
						board_kind: mondayBoard.board_kind,
						state: mondayBoard.state,
						updated_at: new Date().toISOString(),
					});

					// Sync Groups
					if (mondayBoard.groups) {
						// Get existing group sync settings to preserve them
						const { data: dbGroups } = await supabaseAdmin.from("monday_group").select("id, sync_enabled").eq("board_id", board.id);

						const syncSettingsMap = new Map(dbGroups?.map((g) => [g.id, g.sync_enabled]) || []);

						const groupsToUpsert = mondayBoard.groups.map((group: any) => ({
							id: group.id,
							board_id: board.id,
							title: group.title,
							position: group.position?.toString() || null,
							color: group.color || null,
							sync_enabled: syncSettingsMap.get(group.id) ?? true,
							updated_at: new Date().toISOString(),
						}));

						if (groupsToUpsert.length > 0) {
							await supabaseAdmin.from("monday_group").upsert(groupsToUpsert, { onConflict: "board_id,id" });
						}
					}

					// Verify/Register Webhooks (reconcile also clears stale/duplicate ones)
					if (reconcile) {
						await reconcileWebhooks(board.id, token);
					} else {
						await registerBoardWebhooks(board.id, token);
					}
				}

				// B. Sync Items (Full reconciliation)
				// getBoardTasks internally triggers a background background batch upsert of all items
				await getBoardTasks(board.id);

				results.push({ boardId: board.id, status: "success" });
			} catch (boardError) {
				console.error(`[Reconciliation Cron] Error syncing board ${board.id}:`, boardError);
				results.push({ boardId: board.id, status: "error", error: String(boardError) });
			}
		}

		return NextResponse.json({
			success: true,
			timestamp: new Date().toISOString(),
			results,
		});
	} catch (error) {
		console.error("[Reconciliation Cron] Fatal error:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
