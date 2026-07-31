"use client";

import { Text } from "@mantine/core";
import { useEffect } from "react";

import { ErrorState, LoadingState } from "@/components";
import { AuswertungTable } from "@/components/dashboard/analytics/AuswertungTable";
import AuswertungToolbar from "@/components/dashboard/analytics/AuswertungToolbar";
import { useFilteredAuswertung } from "@/components/dashboard/analytics/hooks/useFilteredAuswertung";
import { useAuswertungStore } from "@/stores/auswertungStore";
import { useMondayStore } from "@/stores/mondayStore";

/**
 * Auswertung (per-user weekly utilization) view — one row per user, showing how
 * the selected ISO work week split between billable (`role.hourly_rate > 0`)
 * and non-billable (`0`) tracked time, with a per-role drill-down. Every user
 * appears even with zero tracked time that week — this view is meant to
 * surface gaps, not just activity (see `lib/auswertung.ts`).
 *
 * Navigated via `AuswertungToolbar`'s ◀ / ▶ week stepper, a date-jump picker,
 * and a "Diese Woche" reset; only the search filter is client-side (see
 * `useFilteredAuswertung`) — the week itself narrows the rollup server-side.
 *
 * Access is gated the same as this route was already registered for in
 * `lib/permissions/routes.ts` (analytics-team allowlist or admin), enforced
 * both there (hides the nav link) and server-side in the API route.
 */
export default function AuswertungPage() {
	const sessionToken = useMondayStore((state) => state.sessionToken);

	const weekStart = useAuswertungStore((state) => state.weekStart);
	const loading = useAuswertungStore((state) => state.loading);
	const error = useAuswertungStore((state) => state.error);
	const goToCurrentWeek = useAuswertungStore((state) => state.goToCurrentWeek);

	const { rows, hasActiveFilters } = useFilteredAuswertung();

	// Fetch the current week once the monday session is ready — mirrors the
	// no-auto-fetch convention in stores/CLAUDE.md. `goToCurrentWeek` both sets
	// `weekStart` (still null at this point, see the store's doc comment) and
	// triggers the first fetch.
	useEffect(() => {
		if (sessionToken && !weekStart) {
			goToCurrentWeek();
		}
	}, [sessionToken, weekStart, goToCurrentWeek]);

	return (
		<div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
			<AuswertungToolbar />
			<div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 32 }}>
				{error && <ErrorState message={error} />}

				{loading && rows.length === 0 && !error ? <LoadingState /> : hasActiveFilters && rows.length === 0 ? <Text c="dimmed">Keine Mitarbeiter für diese Suche gefunden.</Text> : <AuswertungTable items={rows} loading={loading} error={null} />}
			</div>
		</div>
	);
}
