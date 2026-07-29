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
import type { BudgetBoardStatus, BudgetBoardSettings, AbrechnungRoleBreakdown, AbrechnungLinkedItem, AbrechnungBudgetItem, AbrechnungBoard, ArchivedBudgetPeriod, AbrechnungDateRange } from "@/types/abrechnung";
import type { GetItemsTimeByRoleResult, CalculateRemainingBudgetResult } from "@/types/database";

// Domain types live in `@/types/abrechnung` (not here) so client code — the Zustand
// store, the page — can import them without pulling in this server-only module (which
// imports `lib/supabase/server`'s service-role client). Re-exported for convenience so
// existing server-side importers (e.g. the admin budget-config API route) can keep
// importing them from here.
export type { BudgetBoardStatus, BudgetBoardSettings, AbrechnungRoleBreakdown, AbrechnungLinkedItem, AbrechnungBudgetItem, AbrechnungBoard, ArchivedBudgetPeriod, AbrechnungDateRange };

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
 * @param range   - Optional: narrows the rollup (`totalSeconds`/`totalCost`/`remainingBudget`/
 *                  `utilizationPercent`) to time entries within this date range; `budget`
 *                  itself is unaffected. Unset (or both bounds `null`) means all-time,
 *                  matching pre-existing behavior. Only the active view's toolbar sets this —
 *                  the archive is intentionally never date-filtered.
 * @returns One {@link AbrechnungBoard} per matching `board_config` row.
 */
export async function getAbrechnungData(status: BudgetBoardStatus = "active", boardId?: string, range?: AbrechnungDateRange): Promise<AbrechnungBoard[]> {
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

	return Promise.all(boardConfigs.map((config: any) => loadBudgetBoard(config, status, range)));
}

/** Loads and rolls up a single budget board's items. Never throws — degrades to an empty `items` array. */
async function loadBudgetBoard(config: { board_id: string; settings: unknown; monday_board?: { name: string } | null }, status: BudgetBoardStatus, range?: AbrechnungDateRange): Promise<AbrechnungBoard> {
	const settings = (config.settings ?? {}) as BudgetBoardSettings;
	const boardName = config.monday_board?.name || config.board_id;
	const label = settings.label ?? null;
	const { job_relation_column_id: relationColumnId, budget_column_id: budgetColumnId, cost_column_id: costColumnId } = settings;

	if (!relationColumnId || !budgetColumnId || !costColumnId) {
		console.warn(`[getAbrechnungData] Budget board ${config.board_id} is missing job_relation_column_id/budget_column_id/cost_column_id configuration; skipping.`);
		return { boardId: config.board_id, boardName, label, status, items: [] };
	}

	let rawItems: BudgetBoardItem[];
	try {
		rawItems = await getBudgetBoardItems(config.board_id, relationColumnId, budgetColumnId, costColumnId);
	} catch (err) {
		console.error(`[getAbrechnungData] Failed to fetch items for budget board ${config.board_id}:`, err);
		return { boardId: config.board_id, boardName, label, status, items: [] };
	}

	const items = await Promise.all(rawItems.map((item) => rollupBudgetItem(config.board_id, item, range)));

	return { boardId: config.board_id, boardName, label, status, items };
}

/**
 * Rolls up one budget item's linked job items via the RPC family.
 *
 * `p_board_id` is still passed to `calculate_remaining_budget` for signature compatibility,
 * but as of `supabase/migrations/038_calculate_remaining_budget_per_item_board.sql` the
 * `board_role_override` join uses each time entry's own `board_id`, so a budget item whose
 * linked job items span multiple boards gets each entry's correct board-specific rate override.
 *
 * `range` (added in `039_rollup_functions_date_range.sql`) narrows every RPC call to time
 * entries within the bounds; `item.budget` itself is never touched by it.
 *
 * Per-role time+cost is fetched once via `get_items_time_by_role` (`040_items_time_by_role.sql`)
 * and then regrouped in-memory two ways: collapsed across all linked items for the budget
 * item's own `byRole`, and kept per linked item for `linkedItems[].byRole`/`totalSeconds`/
 * `totalCost`. This replaced an older N+1 (one `calculate_remaining_budget` call per linked
 * item, cost-only, no per-role split) with a single grouped call.
 */
async function rollupBudgetItem(budgetBoardId: string, item: BudgetBoardItem, range?: AbrechnungDateRange): Promise<AbrechnungBudgetItem> {
	const linkedItemIds = item.linkedItemIds;
	const startDate = range?.startDate ?? null;
	const endDate = range?.endDate ?? null;

	if (linkedItemIds.length === 0) {
		return {
			id: item.id,
			name: item.name,
			budget: item.budget,
			totalSeconds: 0,
			totalCost: 0,
			remainingBudget: item.budget,
			utilizationPercent: 0,
			byRole: [],
			linkedItems: item.linkedItems.map((linkedItem) => ({ ...linkedItem, totalSeconds: 0, totalCost: 0, byRole: [] })),
		};
	}

	const [totalTimeResult, itemsByRoleResult, budgetResultRows] = await Promise.all([
		supabaseAdmin.rpc("get_item_total_time", { p_item_ids: linkedItemIds, p_user_id: null, p_start_date: startDate, p_end_date: endDate } as any) as unknown as Promise<{ data: number | null; error: any }>,
		supabaseAdmin.rpc("get_items_time_by_role", { p_item_ids: linkedItemIds, p_user_id: null, p_start_date: startDate, p_end_date: endDate } as any) as unknown as Promise<{ data: GetItemsTimeByRoleResult[] | null; error: any }>,
		supabaseAdmin.rpc("calculate_remaining_budget", {
			p_board_id: budgetBoardId,
			p_item_ids: linkedItemIds,
			p_budget_amount: item.budget ?? 0,
			p_user_id: null,
			p_start_date: startDate,
			p_end_date: endDate,
		} as any) as unknown as Promise<{ data: CalculateRemainingBudgetResult[] | null; error: any }>,
	]);

	if (totalTimeResult.error) console.error(`[getAbrechnungData] get_item_total_time failed for budget item ${item.id}:`, totalTimeResult.error);
	if (itemsByRoleResult.error) console.error(`[getAbrechnungData] get_items_time_by_role failed for budget item ${item.id}:`, itemsByRoleResult.error);
	if (budgetResultRows.error) console.error(`[getAbrechnungData] calculate_remaining_budget failed for budget item ${item.id}:`, budgetResultRows.error);

	const itemsByRoleData = itemsByRoleResult.data ?? [];
	const colorMap = await getRoleColorMap(itemsByRoleData.filter((r) => r.role_id !== null).map((r) => r.role_id as string));
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

	// Collapse across all linked items → the budget item's own "Zeit nach Rolle". Role-less
	// rows (role_id === null) are excluded from the breakdown but still count toward
	// totalSeconds/totalCost via the get_item_total_time/calculate_remaining_budget calls above.
	const byRoleTotals = new Map<string, { roleName: string; totalSeconds: number; totalCost: number; entryCount: number }>();
	for (const row of itemsByRoleData) {
		if (row.role_id === null) continue;
		const existing = byRoleTotals.get(row.role_id);
		if (existing) {
			existing.totalSeconds += row.total_seconds;
			existing.totalCost += row.total_cost;
			existing.entryCount += row.entry_count;
		} else {
			byRoleTotals.set(row.role_id, { roleName: row.role_name ?? "", totalSeconds: row.total_seconds, totalCost: row.total_cost, entryCount: row.entry_count });
		}
	}
	const byRole: AbrechnungRoleBreakdown[] = Array.from(byRoleTotals.entries())
		.map(([roleId, r]) => ({ roleId, roleName: r.roleName, totalSeconds: r.totalSeconds, totalCost: r.totalCost, entryCount: r.entryCount, colorHex: colorMap.get(roleId) }))
		.sort((a, b) => b.totalSeconds - a.totalSeconds);

	// Kept per linked item → each linked item's own time/cost and role breakdown.
	const rowsByItemId = new Map<string, GetItemsTimeByRoleResult[]>();
	for (const row of itemsByRoleData) {
		const rows = rowsByItemId.get(row.item_id);
		if (rows) rows.push(row);
		else rowsByItemId.set(row.item_id, [row]);
	}
	const linkedItems: AbrechnungLinkedItem[] = item.linkedItems.map((linkedItem) => {
		const rows = rowsByItemId.get(linkedItem.id) ?? [];
		const totalSeconds = rows.reduce((sum, r) => sum + r.total_seconds, 0);
		const totalCost = rows.reduce((sum, r) => sum + r.total_cost, 0);
		const linkedByRole: AbrechnungRoleBreakdown[] = rows
			.filter((r) => r.role_id !== null)
			.map((r) => ({ roleId: r.role_id as string, roleName: r.role_name ?? "", totalSeconds: r.total_seconds, totalCost: r.total_cost, entryCount: r.entry_count, colorHex: colorMap.get(r.role_id as string) }))
			.sort((a, b) => b.totalSeconds - a.totalSeconds);

		return { ...linkedItem, totalSeconds, totalCost, byRole: linkedByRole };
	});

	return {
		id: item.id,
		name: item.name,
		budget: item.budget,
		totalSeconds: totalTimeResult.data ?? 0,
		totalCost: budgetResult?.total_cost ?? 0,
		remainingBudget: item.budget !== null ? (budgetResult?.remaining_budget ?? item.budget) : null,
		utilizationPercent: utilizationPercent,
		byRole,
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
