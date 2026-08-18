import { NextRequest, NextResponse } from "next/server";

import { upsertMondayBoard } from "@/lib/database";
import { requireAdmin } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

import type { ThirdPartyBoardSettings } from "@/types/abrechnung";

/**
 * PATCH /api/admin/boards/[boardId]/third-party-board-config
 *
 * Creates or updates a Fremdkosten-Board's `third_party_status_column_id` /
 * `third_party_item_cost_column_id` mapping (see {@link ThirdPartyBoardSettings}) — the status
 * and per-item cost columns shown for linked Fremdleistungen in the Abrechnung drill-down
 * (`app/admin/page.tsx`'s "Fremdkosten-Boards" list). Modeled on `budget-config`'s PATCH:
 * `board_config` rows are UPDATE-only via `update_board_config` (`037_board_settings_merge.sql`),
 * so this creates the row first when it doesn't exist yet (e.g. a Fremdkosten-Board never added
 * under "Boards verwalten").
 *
 * The update path uses `update_board_config` with only `p_patch` set (scalars left `null`)
 * rather than `POST /api/admin/boards`, which wholesale-replaces `settings` and would wipe
 * `board_selectable`/`jobs_selectable` on a board that's also a tracked time-tracking board.
 *
 * Body: `{ board_name, workspace_id?, third_party_status_column_id, third_party_item_cost_column_id }`.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { boardId } = await params;
		const body = await request.json();
		const { board_name, workspace_id, third_party_status_column_id, third_party_item_cost_column_id } = body as {
			board_name?: string;
			workspace_id?: string;
			third_party_status_column_id?: string;
			third_party_item_cost_column_id?: string;
		};

		if (!board_name || typeof board_name !== "string") {
			return NextResponse.json({ error: "Board name is required" }, { status: 400 });
		}

		if (!third_party_status_column_id || typeof third_party_status_column_id !== "string") {
			return NextResponse.json({ error: "third_party_status_column_id is required" }, { status: 400 });
		}

		// Ensure the monday_board dimension row exists so the board_config FK holds.
		await upsertMondayBoard(boardId, board_name, workspace_id ?? undefined);

		const settingsPatch: ThirdPartyBoardSettings = { third_party_status_column_id, third_party_item_cost_column_id };

		const { data: existing } = await supabaseAdmin.from("board_config").select("board_id").eq("board_id", boardId).maybeSingle();

		let board;
		if (!existing) {
			// First-time third-party board: insert the row directly (update_board_config is
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
				console.error("Error creating third-party board config:", error);
				return NextResponse.json({ error: "Failed to create third-party board configuration" }, { status: 500 });
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
				console.error("Error updating third-party board config:", error);
				return NextResponse.json({ error: "Failed to update third-party board configuration" }, { status: 500 });
			}
			board = data;
		}

		return NextResponse.json({ success: true, board });
	} catch (error) {
		console.error("Error in PATCH /api/admin/boards/[boardId]/third-party-board-config:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * DELETE /api/admin/boards/[boardId]/third-party-board-config
 *
 * Clears a Fremdkosten-Board's `third_party_status_column_id` **and**
 * `third_party_item_cost_column_id` mappings (sets both to `null` via the same merge RPC).
 * Deliberately does **not** touch `job_status_column_id` — that's a different board role (see
 * {@link JobBoardSettings} vs. {@link ThirdPartyBoardSettings}) and clearing it here would wipe a
 * job board's mapping if the same monday board happens to serve both roles. Also deliberately
 * does **not** delete the `board_config` row — the board may also be a tracked time-tracking
 * board, and the row carries `board_selectable`, group config, and its `column_sync_config`
 * children (FK `ON DELETE CASCADE`).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { boardId } = await params;

		// jsonb `||` merge (see update_board_config) needs an actual JSON null to clear the
		// keys' values — ThirdPartyBoardSettings' optional-property type can't express that
		// literal, so the patch is built as a plain object rather than typed as ThirdPartyBoardSettings.
		const { data, error } = await supabaseAdmin.rpc("update_board_config" as any, {
			p_board_id: boardId,
			p_patch: { third_party_status_column_id: null, third_party_item_cost_column_id: null },
			p_sync_enabled: null,
			p_display_enabled: null,
			p_sort_order: null,
		});

		if (error) {
			console.error("Error clearing third-party board config:", error);
			return NextResponse.json({ error: "Failed to remove third-party board configuration" }, { status: 500 });
		}

		// No cache to clear for the removed board itself here — clearBudgetBoardItemsCache
		// targets budget boards keyed by their own column config; a Fremdkosten-Board's cached
		// linked-status/cost data lives inside whichever budget board(s) reference it, and those
		// keys already change (and therefore miss) via the columnMapsHash in the cache key —
		// see lib/monday.ts's budgetBoardItemsCacheKey.
		return NextResponse.json({ success: true, board: data });
	} catch (error) {
		console.error("Error in DELETE /api/admin/boards/[boardId]/third-party-board-config:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
