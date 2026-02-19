import { NextRequest, NextResponse } from "next/server";
import { ApiClient } from "@mondaydotcomorg/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { MondayGroupInsert } from "@/types/database";
import { registerBoardWebhooks } from "@/lib/monday/webhooks";

/**
 * GET /api/admin/boards/[boardId]/groups
 * Fetch groups for a specific board from monday API, upsert into DB, return with sync status
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const { boardId } = await params;
		const token = process.env.MONDAY_API_TOKEN;
		if (!token) {
			return NextResponse.json({ error: "MONDAY_API_TOKEN is not set" }, { status: 500 });
		}

		// 1. Fetch groups from Monday API
		const client = new ApiClient({ token, apiVersion: "2025-10" });
		const query = `
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

		console.log(`[API/groups] Fetching groups for board ${boardId} from Monday API...`);

		const response = await client.request<any>(query, { boardId });
		console.log("[API/groups] Raw response from Monday API:", response);

		if (response.error || response.data?.error) {
			console.error("Monday API error:", response.error || response.data?.error);
			return NextResponse.json({ error: response.error?.message || response.data?.error?.message || "Failed to fetch groups" }, { status: 500 });
		}

		console.log("[API/groups] Response from Monday API:", response.data);

		const board = response.boards?.[0];
		const apiGroups = board?.groups || [];

		// 1.5 Update board metadata in DB
		if (board) {
			await supabaseAdmin.from("monday_board").upsert({
				id: boardId,
				name: board.name,
				workspace_id: board.workspace_id?.toString(),
				board_kind: board.board_kind,
				state: board.state,
				updated_at: new Date().toISOString(),
			});

			// Register webhooks for the board
			try {
				await registerBoardWebhooks(boardId, token);
			} catch (webhookError) {
				console.error("Failed to register webhooks during group fetch:", webhookError);
				// We don't fail the whole request just because webhooks failed
			}
		}

		// 2. Get existing groups from DB to preserve sync_enabled values
		const { data: dbGroups, error: dbError } = await supabaseAdmin.from("monday_group").select("id, sync_enabled").eq("board_id", boardId);

		if (dbError) {
			console.error("Error fetching groups from DB:", dbError);
		}

		// Create a map of existing sync settings
		const syncSettingsMap = new Map<string, boolean>();
		dbGroups?.forEach((g) => {
			syncSettingsMap.set(g.id, g.sync_enabled);
		});

		// 3. Upsert groups into DB (preserve existing sync_enabled, default new to true)
		const groupsToUpsert: MondayGroupInsert[] = apiGroups.map((group: any) => ({
			id: group.id,
			board_id: boardId,
			title: group.title,
			position: group.position?.toString() || null,
			color: group.color || null,
			sync_enabled: syncSettingsMap.get(group.id) ?? true,
			updated_at: new Date().toISOString(),
		}));

		if (groupsToUpsert.length > 0) {
			const { error: upsertError } = await supabaseAdmin.from("monday_group").upsert(groupsToUpsert, { onConflict: "board_id,id" });

			if (upsertError) {
				console.error("Error upserting groups:", upsertError);
				return NextResponse.json({ error: "Failed to save groups to database" }, { status: 500 });
			}
		}

		// 4. Return groups with sync status
		return NextResponse.json({
			success: true,
			boardId,
			groups: groupsToUpsert.map((g) => ({
				id: g.id,
				title: g.title,
				position: g.position,
				color: g.color,
				sync_enabled: g.sync_enabled,
			})),
			count: groupsToUpsert.length,
		});
	} catch (error) {
		console.error("Error in GET /api/admin/boards/[boardId]/groups:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * PATCH /api/admin/boards/[boardId]/groups
 * Update sync_enabled for a specific group
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const { boardId } = await params;
		const body = await request.json();
		const { groupId, sync_enabled } = body;

		// Validate required fields
		if (!groupId) {
			return NextResponse.json({ error: "groupId is required" }, { status: 400 });
		}

		if (typeof sync_enabled !== "boolean") {
			return NextResponse.json({ error: "sync_enabled must be a boolean" }, { status: 400 });
		}

		// Update the group's sync_enabled status
		const { data, error } = await supabaseAdmin.from("monday_group").update({ sync_enabled, updated_at: new Date().toISOString() }).eq("board_id", boardId).eq("id", groupId).select().single();

		if (error) {
			console.error("Error updating group sync status:", error);
			return NextResponse.json({ error: "Failed to update group sync status" }, { status: 500 });
		}

		if (!data) {
			return NextResponse.json({ error: "Group not found" }, { status: 404 });
		}

		return NextResponse.json({
			success: true,
			group: {
				id: data.id,
				board_id: data.board_id,
				title: data.title,
				sync_enabled: data.sync_enabled,
			},
		});
	} catch (error) {
		console.error("Error in PATCH /api/admin/boards/[boardId]/groups:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
