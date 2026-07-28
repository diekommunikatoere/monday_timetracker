"use client";

import { create } from "zustand";

import { endOfDay, startOfDay } from "@/lib/time/calculations";
import type { AbrechnungBoard, ArchivedBudgetPeriod } from "@/types/abrechnung";

import { useMondayStore } from "./mondayStore";

/**
 * Client-side filter state for the Abrechnung toolbar (`AbrechnungToolbar.tsx`).
 * Only applies to the **active** view — the Archiv section is intentionally never
 * filtered (see root `CLAUDE.md`'s Abrechnung notes / the feature plan).
 *
 * `search`/`utilizationMin`/`utilizationMax` are pure client-side filters, applied by
 * `useFilteredAbrechnung` against the already-fetched `activeBoards`. `startDate`/`endDate`
 * are different: they narrow the *server-side* rollup (`Zeit`/`Agenturleistung`/`Verbleibend`/
 * `Auslastung`, not `Budget`), so changing either refetches `activeBoards` — see `setFilter`.
 */
export interface AbrechnungFilters {
	/** Free-text query, tokenized-fuzzy matched against budget item + linked project/board names. */
	search: string;
	/** Restrict to a single budget board by `boardId`. Client-side; never triggers a refetch. */
	boardId: string | null;
	/** Inclusive rollup range start (local day, converted to an ISO instant on fetch). Triggers a refetch. */
	startDate: Date | null;
	/** Inclusive rollup range end (local day, through end-of-day). Triggers a refetch. */
	endDate: Date | null;
	/** Inclusive lower bound on `utilizationPercent`, in whole percent. `null` = unbounded. */
	utilizationMin: number | null;
	/** Inclusive upper bound on `utilizationPercent`, in whole percent. `null` = unbounded. */
	utilizationMax: number | null;
}

const EMPTY_ABRECHNUNG_FILTERS: AbrechnungFilters = {
	search: "",
	boardId: null,
	startDate: null,
	endDate: null,
	utilizationMin: null,
	utilizationMax: null,
};

/**
 * Data for the Abrechnung (budget rollup) view — `app/dashboards/analytics/abrechnung/page.tsx`.
 *
 * Modeled on `itemTimeEntriesStore`'s fetch-on-demand shape (see `stores/CLAUDE.md`): nothing
 * fetches on creation, and this store deliberately holds **three independent** pieces of state
 * so opening the page never eagerly fetches archived years:
 *
 * 1. `active*` — the current fiscal year's budget boards, fetched on page mount (and
 *    refetched whenever the toolbar's date range changes — see `filters`).
 * 2. `archivePeriods*` — the cheap "pick a year" list, fetched only when the Archiv
 *    accordion section is first expanded.
 * 3. `selectedArchive*` — one archived period's rolled-up budget items, fetched only
 *    once a year is picked from that list.
 */
export interface AbrechnungState {
	/** Current fiscal year's budget boards (usually just one, e.g. "Retainer"), each with its rolled-up items. */
	activeBoards: AbrechnungBoard[];
	activeLoading: boolean;
	activeError: string | null;

	/** Active-view toolbar filters (search/date range/utilization). See {@link AbrechnungFilters}. */
	filters: AbrechnungFilters;

	/** Cheap "pick a year" list of archived periods; not fetched until `fetchArchivePeriods` is called. */
	archivePeriods: ArchivedBudgetPeriod[];
	archivePeriodsLoading: boolean;
	archivePeriodsError: string | null;
	/** Guards against refetching the period list every time the Archiv section is re-expanded. */
	archivePeriodsFetched: boolean;

	/** The archived period currently selected from `archivePeriods` (its `boardId`), or `null`. */
	selectedArchiveBoardId: string | null;
	/** Rolled-up budget boards for `selectedArchiveBoardId`. */
	selectedArchiveBoards: AbrechnungBoard[];
	selectedArchiveLoading: boolean;
	selectedArchiveError: string | null;

	/**
	 * Internal: monotonic counter guarding `fetchActiveBudgetData` against out-of-order
	 * responses — the same latest-wins pattern as `timeEntriesStore`. Necessary here because
	 * a date-range change now re-triggers this fetch, so a slow earlier response must not
	 * clobber a newer one.
	 */
	_activeRequestId: number;

	/** `GET /api/analytics/abrechnung` — the active view. Call from the page's mount `useEffect`. */
	fetchActiveBudgetData: () => Promise<void>;
	/**
	 * Merge a partial filter update. Changing `startDate`/`endDate` re-runs
	 * `fetchActiveBudgetData` (they change what the server returns); `search`/
	 * `utilizationMin`/`utilizationMax` are purely client-side and never refetch.
	 */
	setFilter: (partial: Partial<AbrechnungFilters>) => void;
	/** Clear all active-view filters (refetches if a date range was set). */
	resetFilters: () => void;
	/** `GET /api/analytics/abrechnung/archive` — the year picker. Call when the Archiv section first expands. */
	fetchArchivePeriods: () => Promise<void>;
	/** `GET /api/analytics/abrechnung/archive/:boardId` — one archived period's rolled-up data. */
	selectArchivePeriod: (boardId: string) => Promise<void>;
	/** Clears the currently-selected archived period (e.g. when collapsing back to the year list). */
	clearArchiveSelection: () => void;
}

export const useAbrechnungStore = create<AbrechnungState>()((set, get) => ({
	activeBoards: [],
	activeLoading: false,
	activeError: null,

	filters: EMPTY_ABRECHNUNG_FILTERS,

	archivePeriods: [],
	archivePeriodsLoading: false,
	archivePeriodsError: null,
	archivePeriodsFetched: false,

	selectedArchiveBoardId: null,
	selectedArchiveBoards: [],
	selectedArchiveLoading: false,
	selectedArchiveError: null,

	_activeRequestId: 0,

	fetchActiveBudgetData: async () => {
		const sessionToken = useMondayStore.getState().sessionToken;
		if (!sessionToken) return;

		const requestId = get()._activeRequestId + 1;
		set({ activeLoading: true, activeError: null, _activeRequestId: requestId });

		try {
			const { startDate, endDate } = get().filters;
			const params = new URLSearchParams();
			if (startDate) params.set("from", startOfDay(startDate).toISOString());
			if (endDate) params.set("to", endOfDay(endDate).toISOString());
			const query = params.toString();

			const response = await fetch(`/api/analytics/abrechnung${query ? `?${query}` : ""}`, {
				headers: { Authorization: `Bearer ${sessionToken}` },
			});

			if (!response.ok) {
				throw new Error("Abrechnungsdaten konnten nicht geladen werden");
			}

			const data = await response.json();

			// A newer request started after this one — discard this response so rapid
			// filter changes can't resolve out of order.
			if (get()._activeRequestId !== requestId) return;

			set({ activeBoards: data.boards || [], activeLoading: false });
		} catch (err) {
			if (get()._activeRequestId !== requestId) return;

			set({
				activeError: err instanceof Error ? err.message : "Unbekannter Fehler",
				activeLoading: false,
			});
		}
	},

	setFilter: (partial: Partial<AbrechnungFilters>) => {
		const prev = get().filters;
		const next = { ...prev, ...partial };
		set({ filters: next });

		const rangeChanged = partial.startDate !== undefined && partial.startDate?.getTime() !== prev.startDate?.getTime();
		const rangeEndChanged = partial.endDate !== undefined && partial.endDate?.getTime() !== prev.endDate?.getTime();
		if (rangeChanged || rangeEndChanged) {
			get().fetchActiveBudgetData();
		}
	},

	resetFilters: () => {
		const hadRange = !!(get().filters.startDate || get().filters.endDate);
		set({ filters: EMPTY_ABRECHNUNG_FILTERS });
		if (hadRange) {
			get().fetchActiveBudgetData();
		}
	},

	fetchArchivePeriods: async () => {
		if (get().archivePeriodsFetched) return;

		const sessionToken = useMondayStore.getState().sessionToken;
		if (!sessionToken) return;

		set({ archivePeriodsLoading: true, archivePeriodsError: null });
		try {
			const response = await fetch("/api/analytics/abrechnung/archive", {
				headers: { Authorization: `Bearer ${sessionToken}` },
			});

			if (!response.ok) {
				throw new Error("Archiv-Zeiträume konnten nicht geladen werden");
			}

			const data = await response.json();
			set({ archivePeriods: data.periods || [], archivePeriodsLoading: false, archivePeriodsFetched: true });
		} catch (err) {
			set({
				archivePeriodsError: err instanceof Error ? err.message : "Unbekannter Fehler",
				archivePeriodsLoading: false,
			});
		}
	},

	selectArchivePeriod: async (boardId: string) => {
		const sessionToken = useMondayStore.getState().sessionToken;
		if (!sessionToken) return;

		set({ selectedArchiveBoardId: boardId, selectedArchiveLoading: true, selectedArchiveError: null, selectedArchiveBoards: [] });
		try {
			const response = await fetch(`/api/analytics/abrechnung/archive/${boardId}`, {
				headers: { Authorization: `Bearer ${sessionToken}` },
			});

			if (!response.ok) {
				throw new Error("Archiv-Zeitraum konnte nicht geladen werden");
			}

			const data = await response.json();
			set({ selectedArchiveBoards: data.boards || [], selectedArchiveLoading: false });
		} catch (err) {
			set({
				selectedArchiveError: err instanceof Error ? err.message : "Unbekannter Fehler",
				selectedArchiveLoading: false,
			});
		}
	},

	clearArchiveSelection: () => {
		set({ selectedArchiveBoardId: null, selectedArchiveBoards: [], selectedArchiveError: null });
	},
}));
