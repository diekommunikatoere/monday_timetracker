/**
 * lib/abrechnung.ts — Abrechnung (budget rollup) read orchestrator.
 *
 * Loads "budget boards" — monday boards tagged via `board_config.settings.budget_board_status`
 * (see `supabase/migrations/037_board_settings_merge.sql`'s `update_board_config` RPC; there is
 * no separate schema for this, it's a jsonb tag on the existing `board_config` row) — and for
 * each budget item on those boards, rolls up its linked job items' tracked time / cost /
 * remaining budget via the `get_items_time_by_role` Postgres RPC
 * (`supabase/migrations/040_items_time_by_role.sql`).
 *
 * A budget item's linked job items are discovered dynamically per query via monday's own
 * `linked_items[].board` data ({@link getBudgetBoardItems} in `lib/monday.ts`) — there is no
 * "job board" registry, and archived/moved job boards need no `board_config` row of their own.
 *
 * **Read-only.** Unlike `lib/columnSync.ts` (the write-back orchestrator, which this module is
 * deliberately kept separate from — see `lib/CLAUDE.md`), nothing here writes back to monday.
 */

import { getBudgetBoardItems, getBudgetBoardItem, type BudgetBoardItem } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";

import type { BudgetBoardStatus, BudgetBoardSettings, AbrechnungRoleBreakdown, AbrechnungLinkedItem, AbrechnungBudgetItem, AbrechnungBoard, ArchivedBudgetPeriod, AbrechnungDateRange } from "@/types/abrechnung";
import type { GetItemsTimeByRoleResult } from "@/types/database";

// Domain types live in `@/types/abrechnung` (not here) so client code — the Zustand
// store, the page — can import them without pulling in this server-only module (which
// imports `lib/supabase/server`'s service-role client). Re-exported for convenience so
// existing server-side importers (e.g. the admin budget-config API route) can keep
// importing them from here.
export type { BudgetBoardStatus, BudgetBoardSettings, AbrechnungRoleBreakdown, AbrechnungLinkedItem, AbrechnungBudgetItem, AbrechnungBoard, ArchivedBudgetPeriod, AbrechnungDateRange };

/**
 * Loads every budget board matching `status` (optionally narrowed to a single `boardId`),
 * fetches each board's items from monday, and rolls up tracked time / cost / remaining
 * budget per item via {@link getItemsTimeByRoleForBudgetItems}. Boards missing their column
 * configuration are returned with an empty `items` array (and logged) rather than failing
 * the whole call — one misconfigured board shouldn't take down the rest of the report.
 *
 * Same function serves both the active view (`status: "active"`) and a single archived
 * period (`status: "archived", boardId: "<id>"`) — only the filter differs.
 *
 * @param status       - `"active"` (default) or `"archived"`.
 * @param boardId      - Optional: narrow to one budget board (used for a single archived period).
 * @param range        - Optional: narrows the rollup (`totalSeconds`/`totalCost`/`remainingBudget`/
 *                       `utilizationPercent`) to time entries within this date range; `budget`
 *                       itself is unaffected. Unset (or both bounds `null`) means all-time,
 *                       matching pre-existing behavior. Only the active view's toolbar sets this —
 *                       the archive is intentionally never date-filtered.
 * @param forceRefresh - Bypasses and rewrites the monday-layer Redis cache in
 *                       {@link getBudgetBoardItems} (the toolbar's "Aktualisieren" button, via
 *                       `?refresh=1` on the route). Default `false`.
 * @returns One {@link AbrechnungBoard} per matching `board_config` row.
 */
export async function getAbrechnungData(status: BudgetBoardStatus = "active", boardId?: string, range?: AbrechnungDateRange, forceRefresh = false): Promise<AbrechnungBoard[]> {
	let query = supabaseAdmin.from("board_config").select("board_id, settings, monday_board(name)").eq("settings->>budget_board_status", status);

	if (boardId) {
		query = query.eq("board_id", boardId);
	}

	// The role table is tiny and global — fetching it once here (in parallel with the
	// board_config query) and threading it down replaces what used to be one `role`
	// query per budget item (see getRoleColorMap below).
	const [{ data: boardConfigs, error }, roleColorMap] = await Promise.all([query, getRoleColorMap()]);

	if (error) {
		console.error("[getAbrechnungData] Error loading budget board configs:", error);
		throw new Error("Failed to load budget board configuration");
	}

	if (!boardConfigs || boardConfigs.length === 0) {
		return [];
	}

	return Promise.all(boardConfigs.map((config: any) => loadBudgetBoard(config, status, roleColorMap, range, forceRefresh)));
}

/** Loads and rolls up a single budget board's items. Never throws — degrades to an empty `items` array. */
async function loadBudgetBoard(config: { board_id: string; settings: unknown; monday_board?: { name: string } | null }, status: BudgetBoardStatus, roleColorMap: Map<string, string | undefined>, range?: AbrechnungDateRange, forceRefresh = false): Promise<AbrechnungBoard> {
	const settings = (config.settings ?? {}) as BudgetBoardSettings;
	const boardName = config.monday_board?.name || config.board_id;
	const label = settings.label ?? null;
	const { job_relation_column_id: relationColumnId, budget_column_id: budgetColumnId, cost_column_id: costColumnId, status_column_id: statusColumnId } = settings;

	if (!relationColumnId || !budgetColumnId || !costColumnId || !statusColumnId) {
		console.warn(`[getAbrechnungData] Budget board ${config.board_id} is missing job_relation_column_id/budget_column_id/cost_column_id/status_column_id configuration; skipping.`);
		return { boardId: config.board_id, boardName, label, status, items: [] };
	}

	let rawItems: BudgetBoardItem[];
	try {
		rawItems = await getBudgetBoardItems(config.board_id, relationColumnId, budgetColumnId, costColumnId, statusColumnId, forceRefresh);
	} catch (err) {
		console.error(`[getAbrechnungData] Failed to fetch items for budget board ${config.board_id}:`, err);
		return { boardId: config.board_id, boardName, label, status, items: [] };
	}

	const itemsByRoleByBudgetItem = await getItemsTimeByRoleForBudgetItems(rawItems, range);
	const items = rawItems.map((item) => computeBudgetItemRollup(item, itemsByRoleByBudgetItem.get(item.id) ?? [], roleColorMap));

	return { boardId: config.board_id, boardName, label, status, items };
}

/**
 * Chunk size for {@link getItemsTimeByRoleForBudgetItems}'s `get_items_time_by_role` calls.
 * PostgREST caps a single RPC response at 1 000 rows (see `lib/supabase/pagination.ts`), and
 * a chunk can return more rows than input ids (one row per item **and role**) — 200 keeps
 * real-world chunks comfortably under the cap while still batching a ~200-item board's linked
 * items into a small handful of calls instead of one per budget item.
 */
const ITEMS_TIME_BY_ROLE_CHUNK_SIZE = 200;

/**
 * Batches the per-item, per-role time+cost rollup for every budget item on a board into a
 * few `get_items_time_by_role` calls (chunked over the **union** of every budget item's
 * `linkedItemIds`) instead of one `get_item_total_time` + `get_items_time_by_role` +
 * `calculate_remaining_budget` call per budget item — the fan-out this module used to do.
 *
 * Returns rows grouped **per budget item** (not per linked item): a linked job item
 * referenced by more than one budget item (possible via the relation column — see the
 * `linkedToBudget` inverse index below) contributes its full rows to each budget item it's
 * linked to, matching the old per-item-call behavior of never splitting attribution.
 *
 * `get_items_time_by_role` deliberately includes role-less rows (`role_id IS NULL`) — see
 * `040_items_time_by_role.sql` — so summing every row's `total_seconds`/`total_cost` per
 * budget item (done by {@link computeBudgetItemRollup}) reproduces what `get_item_total_time`
 * / `calculate_remaining_budget` used to compute directly, just via JS summation instead of
 * a Postgres `NUMERIC` aggregate (sub-cent rounding differences are expected, not a bug).
 */
async function getItemsTimeByRoleForBudgetItems(rawItems: BudgetBoardItem[], range?: AbrechnungDateRange): Promise<Map<string, GetItemsTimeByRoleResult[]>> {
	const startDate = range?.startDate ?? null;
	const endDate = range?.endDate ?? null;

	// Inverse index: linked job item id -> every budget item id that links to it. An array
	// value (not a single owner) because a job item can be linked from more than one budget
	// item — that must not collapse to a single attribution.
	const linkedToBudget = new Map<string, string[]>();
	for (const item of rawItems) {
		for (const linkedId of item.linkedItemIds) {
			const owners = linkedToBudget.get(linkedId);
			if (owners) owners.push(item.id);
			else linkedToBudget.set(linkedId, [item.id]);
		}
	}

	const result = new Map<string, GetItemsTimeByRoleResult[]>();
	const unionIds = Array.from(linkedToBudget.keys());
	if (unionIds.length === 0) return result;

	const chunks: string[][] = [];
	for (let i = 0; i < unionIds.length; i += ITEMS_TIME_BY_ROLE_CHUNK_SIZE) {
		chunks.push(unionIds.slice(i, i + ITEMS_TIME_BY_ROLE_CHUNK_SIZE));
	}

	const chunkResults = await Promise.all(
		chunks.map(
			(chunkIds) =>
				supabaseAdmin.rpc("get_items_time_by_role", { p_item_ids: chunkIds, p_user_id: null, p_start_date: startDate, p_end_date: endDate } as any) as unknown as Promise<{
					data: GetItemsTimeByRoleResult[] | null;
					error: any;
				}>,
		),
	);

	for (const { data, error } of chunkResults) {
		if (error) {
			console.error("[getAbrechnungData] get_items_time_by_role batch call failed:", error);
			continue;
		}

		const rows = data ?? [];
		if (rows.length === 1000) {
			console.warn("[getAbrechnungData] get_items_time_by_role returned exactly 1000 rows for one chunk — results may be truncated by the PostgREST row cap; consider lowering ITEMS_TIME_BY_ROLE_CHUNK_SIZE.");
		}

		for (const row of rows) {
			const owners = linkedToBudget.get(row.item_id) ?? [];
			for (const budgetItemId of owners) {
				const existing = result.get(budgetItemId);
				if (existing) existing.push(row);
				else result.set(budgetItemId, [row]);
			}
		}
	}

	return result;
}

/**
 * Pure computation — rolls up one budget item's linked job items from already-fetched
 * `get_items_time_by_role` rows. No RPC/DB calls of its own, so it's reused both by the
 * batched board load ({@link loadBudgetBoard}) and by {@link refreshBudgetItem}'s
 * single-item path.
 *
 * Per-role time+cost is regrouped in-memory two ways: collapsed across all linked items
 * for the budget item's own `byRole`, and kept per linked item for `linkedItems[].byRole`/
 * `totalSeconds`/`totalCost`.
 */
function computeBudgetItemRollup(item: BudgetBoardItem, itemsByRoleData: GetItemsTimeByRoleResult[], roleColorMap: Map<string, string | undefined>): AbrechnungBudgetItem {
	const totalSeconds = itemsByRoleData.reduce((sum, r) => sum + r.total_seconds, 0);
	const totalCost = itemsByRoleData.reduce((sum, r) => sum + r.total_cost, 0);
	const budgetAmount = item.budget ?? 0;

	const utilizationPercent = (() => {
		if (budgetAmount === 0 && totalCost > 0) {
			return null;
		} else if (budgetAmount && totalCost !== undefined) {
			return (totalCost / budgetAmount) * 100;
		} else {
			return 0;
		}
	})();

	// Collapse across all linked items → the budget item's own "Zeit nach Rolle". Role-less
	// rows (role_id === null) are excluded from the breakdown but still count toward
	// totalSeconds/totalCost via the reduce() calls above.
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
		.map(([roleId, r]) => ({ roleId, roleName: r.roleName, totalSeconds: r.totalSeconds, totalCost: r.totalCost, entryCount: r.entryCount, colorHex: roleColorMap.get(roleId) }))
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
		const linkedTotalSeconds = rows.reduce((sum, r) => sum + r.total_seconds, 0);
		const linkedTotalCost = rows.reduce((sum, r) => sum + r.total_cost, 0);
		const linkedByRole: AbrechnungRoleBreakdown[] = rows
			.filter((r) => r.role_id !== null)
			.map((r) => ({ roleId: r.role_id as string, roleName: r.role_name ?? "", totalSeconds: r.total_seconds, totalCost: r.total_cost, entryCount: r.entry_count, colorHex: roleColorMap.get(r.role_id as string) }))
			.sort((a, b) => b.totalSeconds - a.totalSeconds);

		return { ...linkedItem, totalSeconds: linkedTotalSeconds, totalCost: linkedTotalCost, byRole: linkedByRole };
	});

	return {
		id: item.id,
		name: item.name,
		itemUrl: item.itemUrl,
		status: item.status,
		budget: item.budget,
		totalSeconds,
		totalCost,
		remainingBudget: item.budget !== null ? item.budget - totalCost : null,
		utilizationPercent,
		byRole,
		linkedItems,
	};
}

/** Batch-resolves every `role.color_hex`, keyed by `role.id`. `role` is a tiny global table, so fetching it in full once per {@link getAbrechnungData} call (rather than once per budget item, as before) is cheap. */
async function getRoleColorMap(): Promise<Map<string, string | undefined>> {
	const { data: roles, error } = await supabaseAdmin.from("role").select("id, color_hex");
	if (error) {
		console.error("[getAbrechnungData] Failed to load role colors:", error);
		return new Map();
	}
	return new Map((roles ?? []).map((r) => [r.id, r.color_hex ?? undefined]));
}

/**
 * Refreshes a single budget item without re-fetching or re-rolling-up the rest of its
 * board — the Abrechnung table's per-row "Aktualisieren" action, and the escape hatch for
 * {@link getBudgetBoardItems}'s monday-layer cache TTL (a budget/status value edited
 * directly in monday would otherwise stay stale for up to that TTL).
 *
 * Reads the board's column config from `board_config`, re-fetches just this item from
 * monday via `getBudgetBoardItem` (which also patches the cached board array so a
 * subsequent full board load doesn't clobber the refreshed values), then runs the same
 * rollup computation as the batched path — just scoped to this one item's own linked-item ids.
 *
 * @param boardId - The budget board's monday.com ID.
 * @param itemId  - The budget item's monday.com ID.
 * @param range   - Optional date range narrowing the rollup, same as {@link getAbrechnungData}.
 * @returns The refreshed {@link AbrechnungBudgetItem}, or `null` if the board is unconfigured
 *          or the item could not be found on it.
 */
export async function refreshBudgetItem(boardId: string, itemId: string, range?: AbrechnungDateRange): Promise<AbrechnungBudgetItem | null> {
	const { data: config, error } = await supabaseAdmin.from("board_config").select("board_id, settings").eq("board_id", boardId).maybeSingle();

	if (error || !config) {
		console.error(`[refreshBudgetItem] Failed to load board_config for board ${boardId}:`, error);
		return null;
	}

	const settings = (config.settings ?? {}) as BudgetBoardSettings;
	const { job_relation_column_id: relationColumnId, budget_column_id: budgetColumnId, cost_column_id: costColumnId, status_column_id: statusColumnId } = settings;

	if (!relationColumnId || !budgetColumnId || !costColumnId || !statusColumnId) {
		console.warn(`[refreshBudgetItem] Budget board ${boardId} is missing column configuration.`);
		return null;
	}

	let item: BudgetBoardItem | null;
	try {
		item = await getBudgetBoardItem(boardId, itemId, relationColumnId, budgetColumnId, costColumnId, statusColumnId);
	} catch (err) {
		console.error(`[refreshBudgetItem] Failed to fetch item ${itemId} on board ${boardId}:`, err);
		return null;
	}

	if (!item) return null;

	const [itemsByRoleByBudgetItem, roleColorMap] = await Promise.all([getItemsTimeByRoleForBudgetItems([item], range), getRoleColorMap()]);

	return computeBudgetItemRollup(item, itemsByRoleByBudgetItem.get(item.id) ?? [], roleColorMap);
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
