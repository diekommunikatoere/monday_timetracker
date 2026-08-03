"use client";

import { create } from "zustand";

import { addWeeks, endOfISOWeek, startOfISOWeek } from "@/lib/time/calculations";

import { useMondayStore } from "./mondayStore";

import type { AuswertungUserRow } from "@/types/auswertung";

/** Purely client-side filter state for the Auswertung toolbar's search box. */
export interface AuswertungFilters {
	/** Free-text query, tokenized-fuzzy matched against user names. */
	search: string;
}

const EMPTY_AUSWERTUNG_FILTERS: AuswertungFilters = { search: "" };

/**
 * Data for the Auswertung (per-user weekly utilization) view —
 * `app/dashboards/analytics/auswertung/page.tsx`. One ISO work week at a time:
 * `weekStart` (always the Monday of the selected week, or `null` before the
 * page's mount effect picks the current week) drives the server-side rollup via
 * `fetchAuswertung`; `filters.search` is a pure client-side filter applied by
 * `useFilteredAuswertung` against the already-fetched `rows`.
 *
 * `weekStart` starts `null` rather than `new Date()` at module scope: a `Date`
 * computed at import time would differ between the SSR render and the client
 * render and produce a hydration mismatch on the "KW n · dd.mm. – dd.mm.yyyy"
 * label. The page's mount effect calls `goToCurrentWeek()` before first fetch.
 */
export interface AuswertungState {
	weekStart: Date | null;
	rows: AuswertungUserRow[];
	loading: boolean;
	error: string | null;

	filters: AuswertungFilters;

	/** Internal: monotonic counter guarding `fetchAuswertung` against out-of-order responses — same latest-wins pattern as `abrechnungStore`/`timeEntriesStore`, needed here because stepping weeks quickly can resolve out of order. */
	_requestId: number;

	/** `GET /api/analytics/auswertung?from=&to=` for the current `weekStart`. No-ops without a session token or an unset `weekStart`. */
	fetchAuswertung: () => Promise<void>;
	/** Jump to the ISO week containing `date` and refetch. */
	goToWeekOf: (date: Date) => void;
	/** Step the selected week forward/backward by `delta` weeks (e.g. -1 / +1 for ◀ / ▶) and refetch. */
	stepWeek: (delta: number) => void;
	/** Jump to the current ISO week and refetch. */
	goToCurrentWeek: () => void;
	/** Merge a partial filter update. `search` is purely client-side and never refetches. */
	setFilter: (partial: Partial<AuswertungFilters>) => void;
}

export const useAuswertungStore = create<AuswertungState>()((set, get) => ({
	weekStart: null,
	rows: [],
	loading: false,
	error: null,

	filters: EMPTY_AUSWERTUNG_FILTERS,

	_requestId: 0,

	fetchAuswertung: async () => {
		const sessionToken = useMondayStore.getState().sessionToken;
		const weekStart = get().weekStart;
		if (!sessionToken || !weekStart) return;

		const requestId = get()._requestId + 1;
		set({ loading: true, error: null, _requestId: requestId });

		try {
			const from = weekStart.toISOString();
			const to = endOfISOWeek(weekStart).toISOString();
			const params = new URLSearchParams({ from, to });

			const response = await fetch(`/api/analytics/auswertung?${params.toString()}`, {
				headers: { Authorization: `Bearer ${sessionToken}` },
			});

			if (!response.ok) {
				throw new Error("Auswertungsdaten konnten nicht geladen werden");
			}

			const data = await response.json();

			// A newer request started after this one (a fast week-step) — discard
			// this response so rapid navigation can't resolve out of order.
			if (get()._requestId !== requestId) return;

			set({ rows: data.users || [], loading: false });
		} catch (err) {
			if (get()._requestId !== requestId) return;

			set({
				error: err instanceof Error ? err.message : "Unbekannter Fehler",
				loading: false,
			});
		}
	},

	goToWeekOf: (date: Date) => {
		set({ weekStart: startOfISOWeek(date) });
		get().fetchAuswertung();
	},

	stepWeek: (delta: number) => {
		const current = get().weekStart ?? startOfISOWeek(new Date());
		set({ weekStart: addWeeks(current, delta) });
		get().fetchAuswertung();
	},

	goToCurrentWeek: () => {
		set({ weekStart: startOfISOWeek(new Date()) });
		get().fetchAuswertung();
	},

	setFilter: (partial: Partial<AuswertungFilters>) => {
		set({ filters: { ...get().filters, ...partial } });
	},
}));
