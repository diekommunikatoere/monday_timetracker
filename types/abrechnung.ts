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
 * @property budget_board_status          - Presence of this key marks the board as a budget board at all.
 * @property label                        - Display label for archived periods (e.g. `"2025"`); unused for `"active"`.
 * @property job_relation_column_id       - The board_relation/connect_boards column listing linked Agentur-Projekte (job items). Required.
 * @property third_party_relation_column_id - A **separate** board_relation/connect_boards column listing linked
 *   Fremdleistungen (third-party items) — distinct from {@link job_relation_column_id} so the two roles never
 *   collapse onto the same linked-items list. Optional: absent means this budget board has no Fremdleistungen.
 * @property agency_budget_column_id      - The numbers/formula/mirror column holding the total (agency) budget figure. Required.
 * @property agency_cost_column_id        - The numbers/formula/mirror column holding the tracked-cost ("Agenturleistung") figure. Required.
 * @property third_party_budget_column_id - The numbers/formula/mirror column holding the "Fremdkosten-Budget" figure, read
 *   as-is (not derived from the linked Fremdleistungen). Optional, paired with {@link third_party_relation_column_id}.
 * @property third_party_cost_column_id   - The numbers/formula/mirror column holding the "Fremdkosten-IST" figure, read
 *   as-is. Optional, paired with {@link third_party_relation_column_id}.
 * @property status_column_id             - The status column holding the budget item's current status, labeled "Status-Spalte" in the UI. Required.
 */
export interface BudgetBoardSettings {
	budget_board_status?: BudgetBoardStatus;
	label?: string | null;
	job_relation_column_id?: string;
	third_party_relation_column_id?: string;
	agency_budget_column_id?: string;
	third_party_budget_column_id?: string;
	agency_cost_column_id?: string;
	third_party_cost_column_id?: string;
	status_column_id?: string;
}

/**
 * Job-board-specific keys in `board_config.settings`. Set on the boards that linked
 * Agentur-Projekte live on, not on budget boards — see {@link BudgetBoardSettings}.
 *
 * @property job_status_column_id - The status/dropdown column whose value is shown as a
 *   linked item's status in the Abrechnung drill-down. Absent = no status shown.
 */
export interface JobBoardSettings {
	job_status_column_id?: string;
}

/**
 * Third-party-board-specific keys in `board_config.settings` — set on "Fremdkosten-Boards",
 * the boards linked Fremdleistungen live on. Distinct from and independent of
 * {@link BudgetBoardSettings} (whose `third_party_*_column_id` keys live on the *budget* board
 * instead) — a board can be a budget board, a Fremdkosten-Board, or both, and neither role
 * shares a settings key with the other.
 *
 * @property third_party_status_column_id   - The status/dropdown column whose value is shown as a
 *   linked Fremdleistungs-item's status in the Abrechnung drill-down. Absent = no status shown.
 *   Also the discriminator used to list this board under admin's "Fremdkosten-Boards" section.
 * @property third_party_item_cost_column_id - The numbers/formula/mirror column on *this* board
 *   holding an individual Fremdleistungs-item's own cost — resolved per linked item via whichever
 *   board it currently lives on, the same pattern as {@link JobBoardSettings.job_status_column_id}.
 */
export interface ThirdPartyBoardSettings {
	third_party_status_column_id?: string;
	third_party_item_cost_column_id?: string;
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
	/** The linked item's status on its own job board, resolved via that board's configured `job_status_column_id` (see {@link JobBoardSettings}). `{ text: null, color: null }` when unmapped or unset. */
	status: { text: string | null; color: string | null };
}

/**
 * A Fremdleistungs-item (third-party/subcontracted item) linked to a budget item via its
 * {@link BudgetBoardSettings.third_party_relation_column_id}. Unlike {@link AbrechnungLinkedItem},
 * it carries no time entries and no role breakdown — its cost is read straight off its own
 * Fremdkosten-Board column (see {@link ThirdPartyBoardSettings.third_party_item_cost_column_id}).
 */
export interface AbrechnungThirdPartyItem {
	id: string;
	name: string;
	itemUrl: string;
	board: { id: string; name: string } | null;
	cost: number | null;
	/** The item's status on its own Fremdkosten-Board, resolved via that board's configured `third_party_status_column_id` (see {@link ThirdPartyBoardSettings}). `{ text: null, color: null }` when unmapped or unset. */
	status: { text: string | null; color: string | null };
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
	/** Read as-is from the budget board's own mapped column — a planned figure, not derived from `thirdPartyItems`. */
	thirdPartyBudget: number | null;
	/** Summed from `thirdPartyItems[].cost` (each linked Fremdleistung's own cost column) rather than read off the budget item's own column — monday can't reliably compute a formula/mirror rollup over the same connect-board relation. `null` when `thirdPartyItems` is empty. */
	thirdPartyTotalCost: number | null;
	byRole: AbrechnungRoleBreakdown[];
	linkedItems: AbrechnungLinkedItem[];
	thirdPartyItems: AbrechnungThirdPartyItem[];
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
