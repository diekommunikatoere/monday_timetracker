import { NextRequest, NextResponse } from "next/server";

import type { BudgetBoardSettings, BudgetBoardStatus } from "@/lib/abrechnung";
import { upsertMondayBoard } from "@/lib/database";
import { requireAdmin } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * GET /api/admin/boards/[boardId]/budget-config
 *
 * Reads a board's budget-board settings (the four `board_config.settings` keys —
 * see `lib/abrechnung.ts`'s {@link BudgetBoardSettings}) for the admin "Budget-Boards"
 * tab. Returns `exists: false` (still 200) for a board with no `board_config` row yet,
 * since that's the normal state before a budget board has been configured for the first time.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { boardId } = await params;

		const { data, error } = await supabaseAdmin.from("board_config").select("board_id, settings, monday_board(name, workspace_id)").eq("board_id", boardId).maybeSingle();

		if (error) {
			console.error("Error fetching budget board config:", error);
			return NextResponse.json({ error: "Failed to fetch budget board configuration" }, { status: 500 });
		}

		if (!data) {
			return NextResponse.json({ success: true, exists: false, boardId, settings: {} as BudgetBoardSettings });
		}

		const settings = (data.settings ?? {}) as BudgetBoardSettings;

		return NextResponse.json({
			success: true,
			exists: true,
			boardId: data.board_id,
			boardName: (data as any).monday_board?.name ?? null,
			isBudgetBoard: !!settings.budget_board_status,
			settings,
		});
	} catch (error) {
		console.error("Error in GET /api/admin/boards/[boardId]/budget-config:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * PATCH /api/admin/boards/[boardId]/budget-config
 *
 * Creates or updates a board's budget-board settings. `board_config` rows are
 * UPDATE-only via `update_board_config` (see `037_board_settings_merge.sql`), so
 * this route creates the row first (with sync/display off — budget boards aren't
 * job boards and don't participate in time-tracking board selection or column
 * write-back sync) when it doesn't exist yet, matching the "existing add-board
 * flow must run first" note in the Abrechnung plan.
 *
 * Body: `{ board_name, workspace_id?, budget_board_status, label?, job_relation_column_id, budget_amount_column_id, budget_column_id }`.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { boardId } = await params;
		const body = await request.json();
		const { board_name, workspace_id, budget_board_status, label, job_relation_column_id, budget_amount_column_id, budget_column_id } = body as {
			board_name?: string;
			workspace_id?: string;
			budget_board_status?: BudgetBoardStatus;
			label?: string | null;
			job_relation_column_id?: string;
			budget_amount_column_id?: string;
			budget_column_id?: string;
		};

		if (!board_name || typeof board_name !== "string") {
			return NextResponse.json({ error: "Board name is required" }, { status: 400 });
		}

		if (budget_board_status !== "active" && budget_board_status !== "archived") {
			return NextResponse.json({ error: "budget_board_status must be 'active' or 'archived'" }, { status: 400 });
		}

		if (!job_relation_column_id || !budget_amount_column_id || !budget_column_id) {
			return NextResponse.json({ error: "job_relation_column_id, budget_amount_column_id, and budget_column_id are required" }, { status: 400 });
		}

		// Ensure the monday_board dimension row exists so the board_config FK holds.
		await upsertMondayBoard(boardId, board_name, workspace_id ?? undefined);

		const settingsPatch: BudgetBoardSettings = {
			budget_board_status,
			label: budget_board_status === "archived" ? (label ?? null) : null,
			job_relation_column_id,
			budget_amount_column_id,
			budget_column_id,
		};

		const { data: existing } = await supabaseAdmin.from("board_config").select("board_id").eq("board_id", boardId).maybeSingle();

		let board;
		if (!existing) {
			// First-time budget board: insert the row directly (update_board_config is
			// UPDATE-only). sync/display stay off — budget boards don't take part in
			// job-board time-tracking selection or column write-back sync.
			const { data, error } = await supabaseAdmin
				.from("board_config")
				.insert({
					board_id: boardId,
					sync_enabled: false,
					display_enabled: false,
					sort_order: 0,
					settings: settingsPatch as any,
				})
				.select()
				.single();

			if (error) {
				console.error("Error creating budget board config:", error);
				return NextResponse.json({ error: "Failed to create budget board configuration" }, { status: 500 });
			}
			board = data;
		} else {
			const { data, error } = await supabaseAdmin.rpc("update_board_config" as any, {
				p_board_id: boardId,
				p_patch: settingsPatch,
				p_sync_enabled: null,
				p_display_enabled: null,
				p_sort_order: null,
			});

			if (error) {
				console.error("Error updating budget board config:", error);
				return NextResponse.json({ error: "Failed to update budget board configuration" }, { status: 500 });
			}
			board = data;
		}

		return NextResponse.json({ success: true, board });
	} catch (error) {
		console.error("Error in PATCH /api/admin/boards/[boardId]/budget-config:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
