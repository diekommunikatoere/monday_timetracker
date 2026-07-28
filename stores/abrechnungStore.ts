"use client";

import { create } from "zustand";

import type { AbrechnungBoard, ArchivedBudgetPeriod } from "@/types/abrechnung";

import { useMondayStore } from "./mondayStore";

/**
 * Data for the Abrechnung (budget rollup) view — `app/dashboards/analytics/abrechnung/page.tsx`.
 *
 * Modeled on `itemTimeEntriesStore`'s fetch-on-demand shape (see `stores/CLAUDE.md`): nothing
 * fetches on creation, and this store deliberately holds **three independent** pieces of state
 * so opening the page never eagerly fetches archived years:
 *
 * 1. `active*` — the current fiscal year's budget boards, fetched on page mount.
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

	/** `GET /api/analytics/abrechnung` — the active view. Call from the page's mount `useEffect`. */
	fetchActiveBudgetData: () => Promise<void>;
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

	archivePeriods: [],
	archivePeriodsLoading: false,
	archivePeriodsError: null,
	archivePeriodsFetched: false,

	selectedArchiveBoardId: null,
	selectedArchiveBoards: [],
	selectedArchiveLoading: false,
	selectedArchiveError: null,

	fetchActiveBudgetData: async () => {
		const sessionToken = useMondayStore.getState().sessionToken;
		if (!sessionToken) return;

		set({ activeLoading: true, activeError: null });
		try {
			const response = await fetch("/api/analytics/abrechnung", {
				headers: { Authorization: `Bearer ${sessionToken}` },
			});

			if (!response.ok) {
				throw new Error("Abrechnungsdaten konnten nicht geladen werden");
			}

			const data = await response.json();
			set({ activeBoards: data.boards || [], activeLoading: false });
		} catch (err) {
			set({
				activeError: err instanceof Error ? err.message : "Unbekannter Fehler",
				activeLoading: false,
			});
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
