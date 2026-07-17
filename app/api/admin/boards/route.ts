import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/monday-auth";
import { upsertMondayBoard } from "@/lib/database";

/**
 * GET /api/admin/boards
 * Fetch all board configurations, ordered by display sort order.
 * Note: Authentication is handled server-side via requireAdmin
 */
export async function GET(request: NextRequest) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");

		let query = supabaseAdmin.from("board_config").select("*, monday_board(name, workspace_id)").order("sort_order", { ascending: true });

		if (boardId) {
			query = query.eq("board_id", boardId);
		}

		const { data: boards, error } = await query;

		if (error) {
			console.error("Error fetching board configs. Query:", query, "Error:", error);
			return NextResponse.json({ error: `Failed to fetch board configurations: ${error.message}` }, { status: 500 });
		}

		const boardIds = boards?.map((b) => b.board_id) || [];
		let lastSyncs: Record<string, any> = {};
		let boardsWithBudgetMapping = new Set<string>();

		if (boardIds.length > 0) {
			const [{ data: syncLogs }, { data: budgetMappings }] = await Promise.all([supabaseAdmin.from("sync_log").select("board_id, created_at, success").in("board_id", boardIds).order("created_at", { ascending: false }), supabaseAdmin.from("column_sync_config").select("board_id").in("board_id", boardIds).eq("sync_purpose", "budget_used").eq("sync_enabled", true)]);

			// Group by board_id and take the first (latest) one
			if (syncLogs) {
				syncLogs.forEach((log: any) => {
					if (!lastSyncs[log.board_id]) {
						lastSyncs[log.board_id] = log;
					}
				});
			}

			boardsWithBudgetMapping = new Set((budgetMappings || []).map((m: any) => m.board_id));
		}

		const boardsWithStatus = boards?.map((board: any) => {
			const lastSync = lastSyncs[board.board_id];
			const configStatus = board.sync_enabled && !boardsWithBudgetMapping.has(board.board_id) ? "YELLOW" : "GREEN";

			return {
				...board,
				last_sync: lastSync?.created_at || null,
				sync_success: lastSync?.success ?? null,
				config_status: configStatus,
			};
		});

		return NextResponse.json({
			success: true,
			boards: boardsWithStatus || [],
			count: boards?.length || 0,
		});
	} catch (error) {
		console.error("Error in GET /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * POST /api/admin/boards
 * Create or update a board configuration (upsert)
 * Note: Authentication is handled server-side via requireAdmin
 */
export async function POST(request: NextRequest) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const body = await request.json();
		const { board_id, board_name, workspace_id, sync_enabled, display_enabled, sort_order, settings } = body;

		if (!board_id || typeof board_id !== "string") {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		if (!board_name || typeof board_name !== "string") {
			return NextResponse.json({ error: "Board name is required" }, { status: 400 });
		}

		// Ensure the monday_board dimension row exists so the board_config FK holds
		await upsertMondayBoard(board_id, board_name, workspace_id ?? undefined);

		const boardData: Record<string, unknown> = {
			board_id,
			sync_enabled: sync_enabled !== false, // Default to true
			display_enabled: display_enabled === true,
			sort_order: sort_order ?? 0,
			settings: settings ?? {},
		};

		// TODO: drop the `as any` once types/database/database.ts is regenerated for migration 033
		// (adds display_enabled/sort_order/settings, drops the six sync/budget columns referenced there).
		const { data: board, error } = await supabaseAdmin
			.from("board_config")
			.upsert(boardData as any, { onConflict: "board_id" })
			.select()
			.single();

		if (error) {
			console.error("Error creating/updating board config:", error);
			return NextResponse.json({ error: "Failed to save board configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			board,
		});
	} catch (error) {
		console.error("Error in POST /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * PATCH /api/admin/boards
 * Update an existing board configuration
 */
export async function PATCH(request: NextRequest) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const body = await request.json();
		const { board_id, sync_enabled, display_enabled, sort_order, settings } = body;

		if (!board_id) {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		// Merge (never overwrite) the settings JSONB atomically in Postgres so a
		// partial or stale payload can't clobber sibling keys. The scalar columns
		// are folded into the same statement; a NULL arg leaves them unchanged.
		// (rpc name cast: generated Functions types aren't regenerated per migration.)
		const { data: board, error } = await supabaseAdmin.rpc("update_board_config" as any, {
			p_board_id: board_id,
			p_patch: settings ?? {},
			p_sync_enabled: sync_enabled ?? null,
			p_display_enabled: display_enabled ?? null,
			p_sort_order: sort_order ?? null,
		});

		if (error) {
			console.error("Error updating board config:", error);
			return NextResponse.json({ error: "Failed to update board configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			board,
		});
	} catch (error) {
		console.error("Error in PATCH /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * DELETE /api/admin/boards
 * Delete a board configuration
 * Note: Authentication is handled server-side via requireAdmin
 */
export async function DELETE(request: NextRequest) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");

		if (!boardId) {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		const { error } = await supabaseAdmin.from("board_config").delete().eq("board_id", boardId);

		if (error) {
			console.error("Error deleting board config:", error);
			return NextResponse.json({ error: "Failed to delete board configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			message: "Board configuration deleted successfully",
		});
	} catch (error) {
		console.error("Error in DELETE /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
