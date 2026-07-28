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
 * @property job_relation_column_id  - The board_relation/connect_boards column listing linked job items.
 * @property budget_amount_column_id - Admin-config field currently labeled "AL-Spalte" in the UI.
 * @property budget_column_id        - The numbers/formula/mirror column holding the total budget figure.
 */
export interface BudgetBoardSettings {
	budget_board_status?: BudgetBoardStatus;
	label?: string | null;
	job_relation_column_id?: string;
	budget_amount_column_id?: string;
	budget_column_id?: string;
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

/** A linked job item shown in a budget item's drill-down, with the board it currently lives on. */
export interface AbrechnungLinkedItem {
	id: string;
	name: string;
	board: { id: string; name: string } | null;
	totalCost: number;
}

/**
 * One budget item (row) in the Abrechnung view, with tracked time/cost rolled up
 * across all of its linked job items (which may span several different job boards).
 */
export interface AbrechnungBudgetItem {
	id: string;
	name: string;
	budgetAmount: number | null;
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

/** A cheap, monday-API-free entry in the "pick a year" archive list. */
export interface ArchivedBudgetPeriod {
	boardId: string;
	boardName: string;
	label: string | null;
}
