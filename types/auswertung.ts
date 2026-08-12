// types/auswertung.ts — Auswertung (per-user weekly utilization) domain types.
//
// Flattened, display-ready shapes shared between the server orchestrator
// (`lib/auswertung.ts`, which computes them) and the client (`stores/auswertungStore.ts`,
// `app/dashboards/analytics/auswertung/page.tsx`, which render them) — mirrors the
// `types/abrechnung.ts` pattern of keeping app-facing shapes out of `lib/` so client
// code never has to import a server-only module (`lib/supabase/server.ts`) just for types.

/**
 * How one role-breakdown row is classified for the two summary columns.
 *
 * - `billable`    — the role's global `role.hourly_rate` is greater than 0.
 * - `nonBillable` — the role exists but its rate is `0` (or `null`).
 * - `unassigned`  — the time entry has no `role_id` at all ("Ohne Rolle").
 *
 * Classified from the **global** rate, not the per-board effective rate
 * (`board_role_override`) — see `supabase/migrations/041_users_time_by_role.sql`'s
 * header for why this view treats billability as a property of the role, not
 * of which board an hour happened to land on.
 */
export type AuswertungRateClass = "billable" | "nonBillable" | "unassigned";

/** Per-role time breakdown for one user's week, enriched with the role's display color. */
export interface AuswertungRoleBreakdown {
	roleId: string | null;
	roleName: string;
	rateClass: AuswertungRateClass;
	hourlyRate: number;
	totalSeconds: number;
	entryCount: number;
	colorHex?: string;
}

/**
 * One user (row) in the Auswertung view, with their tracked time for the
 * selected week split into billable / non-billable / role-less buckets.
 *
 * `billableSeconds + nonBillableSeconds + unassignedSeconds === totalSeconds`
 * always holds — unlike Abrechnung's `byRole`, role-less time is not silently
 * dropped here (see `lib/auswertung.ts`).
 */
export interface AuswertungUserRow {
	userId: string;
	name: string;
	photoUrl?: string | null;
	billableSeconds: number;
	nonBillableSeconds: number;
	unassignedSeconds: number;
	totalSeconds: number;
	/** Sorted descending by `totalSeconds`. */
	byRole: AuswertungRoleBreakdown[];
}

/**
 * Inclusive date bounds for the Auswertung week rollup. Both are ISO instants
 * (not bare dates), computed client-side from the selected ISO week via
 * `startOfISOWeek`/`endOfISOWeek` in `lib/time/calculations.ts` — there is no
 * server-side timezone conversion in this app. Unlike `AbrechnungDateRange`,
 * both bounds are required: an unbounded per-user rollup across the whole
 * table would be the most expensive query in the app, and the client always
 * has a week selected.
 */
export interface AuswertungDateRange {
	startDate: string;
	endDate: string;
}
