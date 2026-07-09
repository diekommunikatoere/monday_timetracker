import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TimeEntry } from "@/types/time-entry";
import { useMondayStore } from "./mondayStore";

/** Page sizes offered by the dashboard's page-size picker. */
export const TIME_ENTRIES_PAGE_SIZES = [25, 50, 100] as const;
/** Default page size — also the server's fallback when an invalid value is sent. */
export const DEFAULT_TIME_ENTRIES_PAGE_SIZE = 50;

/** Client-side search/filter state for the dashboard table. Empty/`null` fields are inactive. */
export interface TimeEntriesFilters {
	/** Free-text query, tokenized-fuzzy matched against task name + comment (see `useFilteredTimeEntries`). */
	search: string;
	roleId: string | null;
	boardId: string | null;
	timerState: string | null;
	/** Inclusive range start. */
	startDate: Date | null;
	/** Inclusive range end (compared through end-of-day — see `useFilteredTimeEntries`). */
	endDate: Date | null;
}

const EMPTY_FILTERS: TimeEntriesFilters = {
	search: "",
	roleId: null,
	boardId: null,
	timerState: null,
	startDate: null,
	endDate: null,
};

/**
 * The current user's **entire** time-entry history for the dashboard table.
 *
 * Unlike the earlier server-paginated version of this store, `fetchTimeEntries`
 * bulk-loads every entry (`GET /api/time-entries` now returns the full set — see
 * `lib/database.ts#getAllUserTimeEntries`). Search, role/board/date filtering, and
 * pagination all run **client-side** afterwards — see
 * `components/dashboard/hooks/useFilteredTimeEntries.ts`, which derives the
 * filtered/paginated view from `allEntries` + `filters` + `page`/`pageSize`. This
 * store never fetches on its own — call `fetchTimeEntries` from an effect.
 * Only `pageSize` is persisted (localStorage); everything else resets each session.
 */
interface TimeEntriesState {
	/** Every entry the user has (newest first); the source data for client-side filtering. */
	allEntries: TimeEntry[];
	loading: boolean;
	error: string | null;

	/** Active search/filter criteria. */
	filters: TimeEntriesFilters;
	/** 1-based current page over the *filtered* result set. */
	page: number;
	/** Rows per page; one of {@link TIME_ENTRIES_PAGE_SIZES}. Persisted. */
	pageSize: number;

	/**
	 * Internal: the `userId` passed to the most recent {@link fetchTimeEntries}
	 * call, cached so `refetch` can be called without requiring the caller to
	 * thread it through again. Not meant to be read by components.
	 */
	_lastUserId: string | null;
	/**
	 * Internal: monotonic counter used as a latest-wins guard. Incremented on
	 * every `fetchTimeEntries` call; a response is only committed to state if
	 * the counter hasn't advanced again in the meantime (i.e. no newer request
	 * is in flight).
	 */
	_requestId: number;

	/**
	 * Load all of the current user's entries from `GET /api/time-entries`.
	 * No-op without a monday session token. The live running timer is excluded
	 * server-side, not filtered here.
	 */
	fetchTimeEntries: (userId: string) => Promise<void>;
	setTimeEntries: (entries: TimeEntry[]) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	/** Re-run `fetchTimeEntries` for the current user (using the `userId` from the
	 * last fetch). Call after saving/editing/deleting a draft to refresh the table;
	 * the filtered view + page-clamping recompute automatically since they derive
	 * from `allEntries`. */
	refetch: (userId: string) => Promise<void>;
	/** Set the current page (over the filtered result set). */
	setPage: (page: number) => void;
	/** Set the page size and reset to page 1. */
	setPageSize: (pageSize: number) => void;
	/** Merge a partial filter update and reset to page 1. */
	setFilter: (partial: Partial<TimeEntriesFilters>) => void;
	/** Clear all filters and reset to page 1. */
	resetFilters: () => void;
}

export const useTimeEntriesStore = create<TimeEntriesState>()(
	persist(
		(set, get) => ({
			allEntries: [],
			loading: false,
			error: null,
			filters: EMPTY_FILTERS,
			page: 1,
			pageSize: DEFAULT_TIME_ENTRIES_PAGE_SIZE,
			_lastUserId: null,
			_requestId: 0,

			fetchTimeEntries: async (userId: string) => {
				if (!userId) return;

				const sessionToken = useMondayStore.getState().sessionToken;
				if (!sessionToken) return;

				const requestId = get()._requestId + 1;
				set({ loading: true, error: null, _requestId: requestId, _lastUserId: userId });

				try {
					const response = await fetch(`/api/time-entries`, {
						headers: {
							Authorization: `Bearer ${sessionToken}`,
						},
					});

					if (!response.ok) {
						throw new Error("Fehler beim Laden der Zeiteinträge");
					}

					const data = await response.json();

					// A newer request started after this one — discard this response so
					// rapid refetches can't resolve out of order.
					if (get()._requestId !== requestId) return;

					set({ allEntries: data.entries ?? [], loading: false });
				} catch (err) {
					if (get()._requestId !== requestId) return;

					set({
						error: err instanceof Error ? err.message : "Unbekannter Fehler",
						loading: false,
					});
				}
			},

			setTimeEntries: (entries) => set({ allEntries: entries }),
			setLoading: (loading) => set({ loading }),
			setError: (error) => set({ error }),

			refetch: async (userId: string) => {
				await get().fetchTimeEntries(userId);
			},

			setPage: (page: number) => set({ page }),

			setPageSize: (pageSize: number) => set({ pageSize, page: 1 }),

			setFilter: (partial: Partial<TimeEntriesFilters>) =>
				set((state) => ({
					filters: { ...state.filters, ...partial },
					page: 1,
				})),

			resetFilters: () => set({ filters: EMPTY_FILTERS, page: 1 }),
		}),
		{
			name: "time-entries-store",
			skipHydration: true, // Important for Next.js SSR
			partialize: (state) => ({
				pageSize: state.pageSize,
				// Don't persist entries/filters/page - they're session-based
			}),
		},
	),
);
