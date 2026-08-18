import { NextRequest, NextResponse } from "next/server";

import { upsertMondayBoard } from "@/lib/database";
import { requireAdmin } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

import type { JobBoardSettings } from "@/types/abrechnung";

/**
 * PATCH /api/admin/boards/[boardId]/job-status-config
 *
 * Creates or updates a job board's `job_status_column_id` mapping (see
 * {@link JobBoardSettings}) — the status column shown for linked Agentur-Projekte in the
 * Abrechnung drill-down (`app/admin/page.tsx`'s "Job-Boards" list). Modeled on
 * `budget-config`'s PATCH: `board_config` rows are UPDATE-only via `update_board_config`
 * (`037_board_settings_merge.sql`), so this creates the row first when it doesn't exist yet
 * (e.g. a job board never added under "Boards verwalten").
 *
 * The update path uses `update_board_config` with only `p_patch` set (scalars left `null`)
 * rather than `POST /api/admin/boards`, which wholesale-replaces `settings` and would wipe
 * `board_selectable`/`jobs_selectable` on a job board that's also a tracked time-tracking board.
 *
 * Body: `{ board_name, workspace_id?, status_column_id }`.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { boardId } = await params;
		const body = await request.json();
		const { board_name, workspace_id, status_column_id } = body as {
			board_name?: string;
			workspace_id?: string;
			status_column_id?: string;
		};

		if (!board_name || typeof board_name !== "string") {
			return NextResponse.json({ error: "Board name is required" }, { status: 400 });
		}

		if (!status_column_id || typeof status_column_id !== "string") {
			return NextResponse.json({ error: "status_column_id is required" }, { status: 400 });
		}

		// Ensure the monday_board dimension row exists so the board_config FK holds.
		await upsertMondayBoard(boardId, board_name, workspace_id ?? undefined);

		const settingsPatch: JobBoardSettings = { job_status_column_id: status_column_id };

		const { data: existing } = await supabaseAdmin.from("board_config").select("board_id").eq("board_id", boardId).maybeSingle();

		let board;
		if (!existing) {
			// First-time job board: insert the row directly (update_board_config is
			// UPDATE-only). sync/display stay off — mapping the status column alone
			// doesn't opt a board into time-tracking board selection or column sync.
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
				console.error("Error creating job board config:", error);
				return NextResponse.json({ error: "Failed to create job board configuration" }, { status: 500 });
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
				console.error("Error updating job board config:", error);
				return NextResponse.json({ error: "Failed to update job board configuration" }, { status: 500 });
			}
			board = data;
		}

		return NextResponse.json({ success: true, board });
	} catch (error) {
		console.error("Error in PATCH /api/admin/boards/[boardId]/job-status-config:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * DELETE /api/admin/boards/[boardId]/job-status-config
 *
 * Clears a job board's `job_status_column_id` mapping (sets it to `null` via the same
 * merge RPC). Deliberately does **not** delete the `board_config` row — a job board is
 * often also a tracked time-tracking board, and the row carries `board_selectable`, group
 * config, and its `column_sync_config` children (FK `ON DELETE CASCADE`).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { boardId } = await params;

		// jsonb `||` merge (see update_board_config) needs an actual JSON null to clear the
		// key's value — JobBoardSettings' optional-property type can't express that literal,
		// so the patch is built as a plain object rather than typed as JobBoardSettings.
		const { data, error } = await supabaseAdmin.rpc("update_board_config" as any, {
			p_board_id: boardId,
			p_patch: { job_status_column_id: null },
			p_sync_enabled: null,
			p_display_enabled: null,
			p_sort_order: null,
		});

		if (error) {
			console.error("Error clearing job board config:", error);
			return NextResponse.json({ error: "Failed to remove job board configuration" }, { status: 500 });
		}

		// No cache to clear for the removed board itself here — clearBudgetBoardItemsCache
		// targets budget boards keyed by their own column config; a job board's cached
		// linked-status data lives inside whichever budget board(s) reference it, and those
		// keys already change (and therefore miss) via the jobStatusHash in the cache key —
		// see lib/monday.ts's budgetBoardItemsCacheKey.
		return NextResponse.json({ success: true, board: data });
	} catch (error) {
		console.error("Error in DELETE /api/admin/boards/[boardId]/job-status-config:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
