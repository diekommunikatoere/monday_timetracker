import { NextRequest, NextResponse } from "next/server";

import { upsertMondayBoard } from "@/lib/database";
import { requireAdmin } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

interface DisplayBoardInput {
	board_id: string;
	board_name: string;
	workspace_id?: string | null;
}

/**
 * PUT /api/admin/boards/display
 *
 * Reconciles the full set of display-enabled boards in one call: the "Boards
 * verwalten" section sends its complete ordered list on every add, remove, and
 * reorder. Array index becomes `sort_order`. Boards no longer in the list have
 * `display_enabled` cleared (their `board_config` row otherwise stays intact —
 * e.g. an existing `sync_enabled` configuration is preserved).
 *
 * Note: Authentication is handled server-side via requireAdmin
 */
export async function PUT(request: NextRequest) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const body = await request.json();
		const boards: DisplayBoardInput[] = Array.isArray(body?.boards) ? body.boards : [];

		if (boards.some((b) => !b?.board_id || !b?.board_name)) {
			return NextResponse.json({ error: "Each board requires board_id and board_name" }, { status: 400 });
		}

		// Ensure monday_board dimension rows exist so the board_config FK holds
		await Promise.all(boards.map((b) => upsertMondayBoard(b.board_id, b.board_name, b.workspace_id ?? undefined)));

		if (boards.length > 0) {
			const upserts = boards.map((b, idx) => ({
				board_id: b.board_id,
				display_enabled: true,
				sort_order: idx,
			}));

			// TODO: drop the `as any` once types/database/database.ts is regenerated for migration 033
			// (adds display_enabled/sort_order/settings, drops the six sync/budget columns referenced there).
			const { error: upsertError } = await supabaseAdmin.from("board_config").upsert(upserts as any, { onConflict: "board_id" });
			if (upsertError) {
				console.error("Error upserting display boards:", upsertError);
				return NextResponse.json({ error: "Failed to save board display settings" }, { status: 500 });
			}
		}

		// Clear display_enabled on any board no longer in the list
		// TODO: drop the `as any` once types/database/database.ts is regenerated for migration 033.
		const enabledIds = boards.map((b) => b.board_id);
		let disableQuery = (supabaseAdmin.from("board_config") as any).update({ display_enabled: false, sort_order: 0 }).eq("display_enabled", true);
		if (enabledIds.length > 0) {
			disableQuery = disableQuery.not("board_id", "in", `(${enabledIds.map((id) => `"${id}"`).join(",")})`);
		}
		const { error: disableError } = await disableQuery;

		if (disableError) {
			console.error("Error clearing removed display boards:", disableError);
			return NextResponse.json({ error: "Failed to reconcile removed boards" }, { status: 500 });
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error in PUT /api/admin/boards/display:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
