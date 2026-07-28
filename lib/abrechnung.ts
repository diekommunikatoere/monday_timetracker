/**
 * lib/abrechnung.ts — Abrechnung (budget rollup) read orchestrator.
 *
 * Loads "budget boards" — monday boards tagged via `board_config.settings.budget_board_status`
 * (see `supabase/migrations/037_board_settings_merge.sql`'s `update_board_config` RPC; there is
 * no separate schema for this, it's a jsonb tag on the existing `board_config` row) — and for
 * each budget item on those boards, rolls up its linked job items' tracked time / cost /
 * remaining budget via the generic `get_item_total_time` / `get_item_time_by_role` /
 * `calculate_remaining_budget` Postgres RPC family (`supabase/migrations/029_timer_constraints_and_drops.sql`).
 *
 * A budget item's linked job items are discovered dynamically per query via monday's own
 * `linked_items[].board` data ({@link getBudgetBoardItems} in `lib/monday.ts`) — there is no
 * "job board" registry, and archived/moved job boards need no `board_config` row of their own.
 *
 * **Read-only.** Unlike `lib/columnSync.ts` (the write-back orchestrator, which this module is
 * deliberately kept separate from — see `lib/CLAUDE.md`), nothing here writes back to monday.
 */

import { getBudgetBoardItems, type BudgetBoardItem } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { BudgetBoardStatus, BudgetBoardSettings, AbrechnungRoleBreakdown, AbrechnungLinkedItem, AbrechnungBudgetItem, AbrechnungBoard, ArchivedBudgetPeriod } from "@/types/abrechnung";
import type { GetItemTimeByRoleResult, CalculateRemainingBudgetResult } from "@/types/database";

// Domain types live in `@/types/abrechnung` (not here) so client code — the Zustand
// store, the page — can import them without pulling in this server-only module (which
// imports `lib/supabase/server`'s service-role client). Re-exported for convenience so
// existing server-side importers (e.g. the admin budget-config API route) can keep
// importing them from here.
export type { BudgetBoardStatus, BudgetBoardSettings, AbrechnungRoleBreakdown, AbrechnungLinkedItem, AbrechnungBudgetItem, AbrechnungBoard, ArchivedBudgetPeriod };

/**
 * Loads every budget board matching `status` (optionally narrowed to a single `boardId`),
 * fetches each board's items from monday, and rolls up tracked time / cost / remaining
 * budget per item via the RPC family. Boards missing their column configuration are
 * returned with an empty `items` array (and logged) rather than failing the whole call —
 * one misconfigured board shouldn't take down the rest of the report.
 *
 * Same function serves both the active view (`status: "active"`) and a single archived
 * period (`status: "archived", boardId: "<id>"`) — only the filter differs.
 *
 * @param status  - `"active"` (default) or `"archived"`.
 * @param boardId - Optional: narrow to one budget board (used for a single archived period).
 * @returns One {@link AbrechnungBoard} per matching `board_config` row.
 */
export async function getAbrechnungData(status: BudgetBoardStatus = "active", boardId?: string): Promise<AbrechnungBoard[]> {
	let query = supabaseAdmin.from("board_config").select("board_id, settings, monday_board(name)").eq("settings->>budget_board_status", status);

	if (boardId) {
		query = query.eq("board_id", boardId);
	}

	const { data: boardConfigs, error } = await query;

	if (error) {
		console.error("[getAbrechnungData] Error loading budget board configs:", error);
		throw new Error("Failed to load budget board configuration");
	}

	if (!boardConfigs || boardConfigs.length === 0) {
		return [];
	}

	return Promise.all(boardConfigs.map((config: any) => loadBudgetBoard(config, status)));
}

/** Loads and rolls up a single budget board's items. Never throws — degrades to an empty `items` array. */
async function loadBudgetBoard(config: { board_id: string; settings: unknown; monday_board?: { name: string } | null }, status: BudgetBoardStatus): Promise<AbrechnungBoard> {
	const settings = (config.settings ?? {}) as BudgetBoardSettings;
	const boardName = config.monday_board?.name || config.board_id;
	const label = settings.label ?? null;
	const { job_relation_column_id: relationColumnId, budget_column_id: budgetColumnId, budget_amount_column_id: budgetAmountColumnId } = settings;

	if (!relationColumnId || !budgetColumnId || !budgetAmountColumnId) {
		console.warn(`[getAbrechnungData] Budget board ${config.board_id} is missing job_relation_column_id/budget_amount_column_id configuration; skipping.`);
		return { boardId: config.board_id, boardName, label, status, items: [] };
	}

	let rawItems: BudgetBoardItem[];
	try {
		rawItems = await getBudgetBoardItems(config.board_id, relationColumnId, budgetColumnId, budgetAmountColumnId);
	} catch (err) {
		console.error(`[getAbrechnungData] Failed to fetch items for budget board ${config.board_id}:`, err);
		return { boardId: config.board_id, boardName, label, status, items: [] };
	}

	const items = await Promise.all(rawItems.map((item) => rollupBudgetItem(config.board_id, item)));

	return { boardId: config.board_id, boardName, label, status, items };
}

/**
 * Rolls up one budget item's linked job items via the RPC family.
 *
 * `p_board_id` is still passed to `calculate_remaining_budget` for signature compatibility,
 * but as of `supabase/migrations/038_calculate_remaining_budget_per_item_board.sql` the
 * `board_role_override` join uses each time entry's own `board_id`, so a budget item whose
 * linked job items span multiple boards gets each entry's correct board-specific rate override.
 */
async function rollupBudgetItem(budgetBoardId: string, item: BudgetBoardItem): Promise<AbrechnungBudgetItem> {
	const linkedItemIds = item.linkedItemIds;
	const linkedItems: AbrechnungLinkedItem[] = item.linkedItems;

	if (linkedItemIds.length === 0) {
		return {
			id: item.id,
			name: item.name,
			budgetAmount: item.budgetAmount,
			totalSeconds: 0,
			totalCost: 0,
			remainingBudget: item.budgetAmount,
			utilizationPercent: 0,
			byRole: [],
			linkedItems,
		};
	}

	const [totalTimeResult, byRoleResult, budgetResultRows] = await Promise.all([
		supabaseAdmin.rpc("get_item_total_time", { p_item_ids: linkedItemIds, p_user_id: null } as any) as unknown as Promise<{ data: number | null; error: any }>,
		supabaseAdmin.rpc("get_item_time_by_role", { p_item_ids: linkedItemIds, p_user_id: null } as any) as unknown as Promise<{ data: GetItemTimeByRoleResult[] | null; error: any }>,
		supabaseAdmin.rpc("calculate_remaining_budget", {
			p_board_id: budgetBoardId,
			p_item_ids: linkedItemIds,
			p_budget_amount: item.budgetAmount ?? 0,
			p_user_id: null,
		} as any) as unknown as Promise<{ data: CalculateRemainingBudgetResult[] | null; error: any }>,
	]);

	if (totalTimeResult.error) console.error(`[getAbrechnungData] get_item_total_time failed for budget item ${item.id}:`, totalTimeResult.error);
	if (byRoleResult.error) console.error(`[getAbrechnungData] get_item_time_by_role failed for budget item ${item.id}:`, byRoleResult.error);
	if (budgetResultRows.error) console.error(`[getAbrechnungData] calculate_remaining_budget failed for budget item ${item.id}:`, budgetResultRows.error);

	const byRoleData = byRoleResult.data ?? [];
	const colorMap = await getRoleColorMap(byRoleData.map((r) => r.role_id));
	const budgetResult = budgetResultRows.data?.[0];
	const utilizationPercent = (() => {
		if (budgetResult?.budget_amount === 0 && budgetResult?.total_cost > 0) {
			return null;
		} else if (budgetResult?.budget_amount && budgetResult?.total_cost !== undefined) {
			return (budgetResult.total_cost / budgetResult.budget_amount) * 100;
		} else {
			return 0;
		}
	})();

	return {
		id: item.id,
		name: item.name,
		budgetAmount: item.budgetAmount,
		totalSeconds: totalTimeResult.data ?? 0,
		totalCost: budgetResult?.total_cost ?? 0,
		remainingBudget: item.budgetAmount !== null ? (budgetResult?.remaining_budget ?? item.budgetAmount) : null,
		utilizationPercent: utilizationPercent,
		byRole: byRoleData.map((r) => ({
			// ! Implement cost per role in RPC
			roleId: r.role_id,
			roleName: r.role_name,
			totalSeconds: r.total_seconds,
			entryCount: r.entry_count,
			colorHex: colorMap.get(r.role_id),
		})),
		linkedItems,
	};
}

/** Batch-resolves `role.color_hex` for a set of role IDs, for {@link AbrechnungRoleBreakdown.colorHex}. */
async function getRoleColorMap(roleIds: string[]): Promise<Map<string, string | undefined>> {
	if (roleIds.length === 0) return new Map();

	const { data: roles } = await supabaseAdmin.from("role").select("id, color_hex").in("id", roleIds);
	return new Map((roles ?? []).map((r) => [r.id, r.color_hex ?? undefined]));
}

/**
 * Lightweight list of archived budget-board periods — reads only `board_config`
 * (no monday API calls), so opening the Archiv section's "pick a year" list is cheap
 * regardless of how many years of archives have accumulated. Fetching a specific
 * period's actual rolled-up data is a separate call: {@link getAbrechnungData}`("archived", boardId)`.
 *
 * @returns One {@link ArchivedBudgetPeriod} per archived `board_config` row.
 */
export async function getArchivedBudgetBoards(): Promise<ArchivedBudgetPeriod[]> {
	const { data, error } = await supabaseAdmin
		.from("board_config")
		.select("board_id, settings, monday_board(name)")
		.eq("settings->>budget_board_status", "archived" satisfies BudgetBoardStatus);

	if (error) {
		console.error("[getArchivedBudgetBoards] Error loading archived budget boards:", error);
		throw new Error("Failed to load archived budget boards");
	}

	return (data ?? []).map((row: any) => {
		const settings = (row.settings ?? {}) as BudgetBoardSettings;
		return {
			boardId: row.board_id,
			boardName: row.monday_board?.name || row.board_id,
			label: settings.label ?? null,
		};
	});
}
