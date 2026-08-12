/**
 * lib/auswertung.ts — Auswertung (per-user weekly utilization) read orchestrator.
 *
 * Answers a question none of the existing rollup RPCs can: "how did each person's
 * week split between billable and non-billable work" — a per-user, cross-board
 * report with no item/board scoping at all. Every RPC in the Abrechnung family
 * (`get_item_total_time`, `get_item_time_by_role`, `get_items_time_by_role`,
 * `calculate_remaining_budget`) requires a set of monday item ids as its first
 * argument, so this uses a new one: `get_users_time_by_role`
 * (`supabase/migrations/041_users_time_by_role.sql`).
 *
 * **Read-only.** Like `lib/abrechnung.ts`, nothing here writes back to monday —
 * this module is Supabase-only and makes no monday GraphQL calls at all.
 */

import { supabaseAdmin } from "@/lib/supabase/server";

import type { AuswertungRateClass, AuswertungRoleBreakdown, AuswertungUserRow, AuswertungDateRange } from "@/types/auswertung";
import type { GetUsersTimeByRoleResult } from "@/types/database";

// Domain types live in `@/types/auswertung` (not here) so client code — the Zustand
// store, the page — can import them without pulling in this server-only module
// (which imports `lib/supabase/server`'s service-role client).
export type { AuswertungRateClass, AuswertungRoleBreakdown, AuswertungUserRow, AuswertungDateRange };

interface UserProfileForAuswertung {
	id: string;
	name: string | null;
	photo_urls: unknown;
}

/** Best-effort extraction of a small avatar URL from the `photo_urls` jsonb bag; tolerates any shape. */
function extractPhotoUrl(photoUrls: unknown): string | null {
	if (!photoUrls || typeof photoUrls !== "object") return null;
	const urls = photoUrls as Record<string, unknown>;
	const candidate = urls.thumb_small ?? urls.thumb ?? urls.small;
	return typeof candidate === "string" ? candidate : null;
}

/** Classifies a `get_users_time_by_role` row into the Auswertung rate bucket. */
function classifyRow(row: GetUsersTimeByRoleResult): AuswertungRateClass {
	if (row.role_id === null) return "unassigned";
	return Number(row.hourly_rate ?? 0) > 0 ? "billable" : "nonBillable";
}

/**
 * Loads every `user_profiles` row and their tracked time for `range`, split into
 * billable / non-billable / role-less buckets, plus the per-role breakdown behind
 * each bucket.
 *
 * Every user appears exactly once, in name order, including users with no tracked
 * time in `range` (zero-filled) — Auswertung is meant to surface gaps, not just
 * activity, so a quiet week must render as `0 h`, not as a missing row.
 *
 * @param range - Required ISO-instant bounds for the rollup (see {@link AuswertungDateRange}).
 *                Unlike Abrechnung's optional range, this is never unbounded — an
 *                all-time scan across every user would be the most expensive query
 *                in the app, and the client always has a week selected.
 * @returns One {@link AuswertungUserRow} per `user_profiles` row.
 */
export async function getAuswertungData(range: AuswertungDateRange): Promise<AuswertungUserRow[]> {
	// `get_users_time_by_role` isn't in the generated `database.ts` Functions map
	// yet (only present once `041_users_time_by_role.sql` has been applied and
	// types regenerated via the Supabase CLI — see `types/CLAUDE.md`; there's no
	// `db:types` script). Cast the whole call rather than hand-editing the
	// generated file; `GetUsersTimeByRoleResult` (types/database/database.types.ts)
	// still gives the response its real shape.
	const [usersResult, rowsResult] = await Promise.all([
		supabaseAdmin.from("user_profiles").select("id, name, photo_urls").order("name") as unknown as Promise<{ data: UserProfileForAuswertung[] | null; error: any }>,
		(supabaseAdmin.rpc as any)("get_users_time_by_role", { p_start_date: range.startDate, p_end_date: range.endDate }) as Promise<{ data: GetUsersTimeByRoleResult[] | null; error: any }>,
	]);

	if (usersResult.error) {
		console.error("[getAuswertungData] Error loading user_profiles:", usersResult.error);
		throw new Error("Failed to load users");
	}
	if (rowsResult.error) {
		console.error("[getAuswertungData] get_users_time_by_role failed:", rowsResult.error);
		throw new Error("Failed to load Auswertung data");
	}

	const users = usersResult.data ?? [];
	const rows = rowsResult.data ?? [];

	// Group the flat RPC rows by user, mirroring the `Map`-fold pattern in
	// `lib/abrechnung.ts`'s `rollupBudgetItem` (one grouping pass over a flat
	// per-role result set, not per-row time arithmetic).
	const rowsByUserId = new Map<string, GetUsersTimeByRoleResult[]>();
	for (const row of rows) {
		const existing = rowsByUserId.get(row.user_id);
		if (existing) existing.push(row);
		else rowsByUserId.set(row.user_id, [row]);
	}

	return users.map((user) => {
		const userRows = rowsByUserId.get(user.id) ?? [];

		let billableSeconds = 0;
		let nonBillableSeconds = 0;
		let unassignedSeconds = 0;

		const byRole: AuswertungRoleBreakdown[] = userRows
			.map((row) => {
				const rateClass = classifyRow(row);
				if (rateClass === "billable") billableSeconds += row.total_seconds;
				else if (rateClass === "nonBillable") nonBillableSeconds += row.total_seconds;
				else unassignedSeconds += row.total_seconds;

				return {
					roleId: row.role_id,
					roleName: row.role_name ?? "Ohne Rolle",
					rateClass,
					hourlyRate: Number(row.hourly_rate ?? 0),
					totalSeconds: row.total_seconds,
					entryCount: row.entry_count,
					colorHex: row.role_color_hex ?? undefined,
				} satisfies AuswertungRoleBreakdown;
			})
			.sort((a, b) => b.totalSeconds - a.totalSeconds);

		return {
			userId: user.id,
			name: user.name || "Unbekannt",
			photoUrl: extractPhotoUrl(user.photo_urls),
			billableSeconds,
			nonBillableSeconds,
			unassignedSeconds,
			totalSeconds: billableSeconds + nonBillableSeconds + unassignedSeconds,
			byRole,
		} satisfies AuswertungUserRow;
	});
}
