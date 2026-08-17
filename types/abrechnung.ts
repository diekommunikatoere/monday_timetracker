// types/abrechnung.ts — Abrechnung (budget rollup) domain types.
//
// Flattened, display-ready shapes shared between the server orchestrator
// (`lib/abrechnung.ts`, which computes them) and the client (`stores/abrechnungStore.ts`,
// `app/dashboards/analytics/abrechnung/page.tsx`, which render them) — mirrors the
// `types/time-entry.ts` pattern of keeping app-facing shapes out of `lib/` so client
// code never has to import a server-only module (`lib/supabase/server.ts`) just for types.

/** Whether a budget board represents the current fiscal year or a closed-out past one. */
export type BudgetBoardStatus = "active" | "archived";

/**
 * The budget-board-specific keys stored in `board_config.settings` (a flat jsonb bag
 * shared with other per-board flags, e.g. `jobs_selectable`; see 037_board_settings_merge.sql's
 * merge-based PATCH).
 *
 * @property budget_board_status     - Presence of this key marks the board as a budget board at all.
 * @property label                   - Display label for archived periods (e.g. `"2025"`); unused for `"active"`.
 * @property job_relation_column_id - The board_relation/connect_boards column listing linked job items.
 * @property budget_column_id       - The numbers/formula/mirror column holding the total budget figure.
 * @property cost_column_id         - The numbers/formula/mirror column holding the cost figure, labeled "Agenturleistungs-Spalte" in the UI.
 * @property status_column_id         - The status column holding the budget item's current status, labeled "Status-Spalte" in the UI.
 */
export interface BudgetBoardSettings {
	budget_board_status?: BudgetBoardStatus;
	label?: string | null;
	job_relation_column_id?: string;
	budget_column_id?: string;
	cost_column_id?: string;
	status_column_id?: string;
}

/** Per-role time breakdown for one budget item, enriched with the role's display color. */
export interface AbrechnungRoleBreakdown {
	roleId: string;
	roleName: string;
	totalSeconds: number;
	totalCost: number;
	entryCount: number;
	colorHex?: string;
}

/**
 * A linked job item shown in a budget item's drill-down, with the board it currently lives on.
 *
 * `byRole` excludes role-less time entries (see `get_items_time_by_role` in
 * `lib/abrechnung.ts`), so it can sum to less than `totalSeconds`/`totalCost` — that's
 * expected, not a bug, matching the budget item's own `AbrechnungBudgetItem.byRole`.
 */
export interface AbrechnungLinkedItem {
	id: string;
	name: string;
	itemUrl: string;
	board: { id: string; name: string } | null;
	totalSeconds: number;
	totalCost: number;
	byRole: AbrechnungRoleBreakdown[];
}

/**
 * One budget item (row) in the Abrechnung view, with tracked time/cost rolled up
 * across all of its linked job items (which may span several different job boards).
 */
export interface AbrechnungBudgetItem {
	id: string;
	name: string;
	itemUrl: string;
	status: { text: string | null; color: string | null };
	budget: number | null;
	totalSeconds: number;
	totalCost: number;
	remainingBudget: number | null;
	utilizationPercent: number | null;
	byRole: AbrechnungRoleBreakdown[];
	linkedItems: AbrechnungLinkedItem[];
}

/** One budget board (e.g. "Retainer", or an archived "Angebote-Archiv 2025") with its rolled-up items. */
export interface AbrechnungBoard {
	boardId: string;
	boardName: string;
	label: string | null;
	status: BudgetBoardStatus;
	items: AbrechnungBudgetItem[];
}

/**
 * A budget item flattened out of its board, for the single-table active-view Abrechnung
 * layout (`AbrechnungTable` with `showBoardColumn`). `AbrechnungBoard.items` don't carry
 * their board's identity on their own — this re-attaches it so rows from different boards
 * can share one table and be told apart via the "Budget-Board" column. See
 * `useFilteredAbrechnung` for where these are produced.
 */
export interface AbrechnungTableRow extends AbrechnungBudgetItem {
	boardId: string;
	boardName: string;
}

/** A cheap, monday-API-free entry in the "pick a year" archive list. */
export interface ArchivedBudgetPeriod {
	boardId: string;
	boardName: string;
	label: string | null;
}

/**
 * Optional date bounds for the Abrechnung "Zeitraum" filter, narrowing which
 * finalized time entries count toward `totalSeconds`/`totalCost`/`remainingBudget`/
 * `utilizationPercent` on {@link AbrechnungBudgetItem} — `budget` itself is unaffected.
 * Both bounds are ISO instants (not bare dates); `null` means unbounded on that side.
 * See `getAbrechnungData` in `lib/abrechnung.ts`.
 */
export interface AbrechnungDateRange {
	startDate: string | null;
	endDate: string | null;
}
