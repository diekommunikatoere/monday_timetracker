import { create } from "zustand";
import { persist } from "zustand/middleware";
import { TimeEntry } from "@/types/time-entry";
import { useMondayStore } from "./mondayStore";

/** Page sizes offered by the dashboard's page-size picker. */
export const TIME_ENTRIES_PAGE_SIZES = [25, 50, 100] as const;
/** Default page size — also the server's fallback when an invalid value is sent. */
export const DEFAULT_TIME_ENTRIES_PAGE_SIZE = 50;

/**
 * The current user's time entries for the dashboard table, server-paginated.
 * The store never fetches on its own — call `fetchTimeEntries` from an effect.
 * Only `pageSize` is persisted (localStorage); `page`/`total`/`timeEntries` reset
 * each session.
 */
interface TimeEntriesState {
	timeEntries: TimeEntry[];
	loading: boolean;
	error: string | null;

	/** 1-based current page. */
	page: number;
	/** Rows per page; one of {@link TIME_ENTRIES_PAGE_SIZES}. Persisted. */
	pageSize: number;
	/** Total row count across all pages for the current user (0 when empty). */
	total: number;

	/**
	 * Internal: the `userId` passed to the most recent {@link fetchTimeEntries}
	 * call, cached so `setPage`/`setPageSize` can refetch without requiring the
	 * caller to thread it through again. Not meant to be read by components.
	 */
	_lastUserId: string | null;
	/**
	 * Internal: monotonic counter used as a latest-wins guard. Incremented on
	 * every `fetchTimeEntries` call; a response is only committed to state if
	 * the counter hasn't advanced again in the meantime (i.e. no newer request
	 * is in flight). Prevents rapid page clicks from resolving out of order.
	 */
	_requestId: number;

	/**
	 * Load the current user's entries for the current `page`/`pageSize` from
	 * `GET /api/time-entries`. No-op without a monday session token. The live
	 * running timer is excluded server-side, not filtered here.
	 */
	fetchTimeEntries: (userId: string) => Promise<void>;
	setTimeEntries: (entries: TimeEntry[]) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	/** Re-run `fetchTimeEntries` at the current page. Steps back a page if the
	 * refetch comes back empty on a page beyond the first (e.g. the last row on
	 * the last page was just deleted). Call after saving a draft to refresh the table. */
	refetch: (userId: string) => Promise<void>;
	/** Set the current page and refetch (using the `userId` from the last fetch). */
	setPage: (page: number) => void;
	/** Set the page size, reset to page 1, and refetch. */
	setPageSize: (pageSize: number) => void;
}

export const useTimeEntriesStore = create<TimeEntriesState>()(
	persist(
		(set, get) => ({
			timeEntries: [],
			loading: false,
			error: null,
			page: 1,
			pageSize: DEFAULT_TIME_ENTRIES_PAGE_SIZE,
			total: 0,
			_lastUserId: null,
			_requestId: 0,

			fetchTimeEntries: async (userId: string) => {
				if (!userId) return;

				const sessionToken = useMondayStore.getState().sessionToken;
				if (!sessionToken) return;

				const requestId = get()._requestId + 1;
				set({ loading: true, error: null, _requestId: requestId, _lastUserId: userId });

				try {
					const { page, pageSize } = get();
					const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });

					const response = await fetch(`/api/time-entries?${params.toString()}`, {
						headers: {
							Authorization: `Bearer ${sessionToken}`,
						},
					});

					if (!response.ok) {
						throw new Error("Fehler beim Laden der Zeiteinträge");
					}

					const data = await response.json();

					// A newer request started after this one — discard this response so
					// rapid page/pageSize changes can't resolve out of order.
					if (get()._requestId !== requestId) return;

					set({ timeEntries: data.entries ?? [], total: data.total ?? 0, loading: false });
				} catch (err) {
					if (get()._requestId !== requestId) return;

					set({
						error: err instanceof Error ? err.message : "Unbekannter Fehler",
						loading: false,
					});
				}
			},

			setTimeEntries: (entries) => set({ timeEntries: entries }),
			setLoading: (loading) => set({ loading }),
			setError: (error) => set({ error }),

			refetch: async (userId: string) => {
				await get().fetchTimeEntries(userId);

				const { timeEntries, page, pageSize, total } = get();
				if (timeEntries.length === 0 && page > 1) {
					const newPage = Math.max(1, Math.ceil(total / pageSize));
					if (newPage !== page) {
						set({ page: newPage });
						await get().fetchTimeEntries(userId);
					}
				}
			},

			setPage: (page: number) => {
				set({ page });
				const userId = get()._lastUserId;
				if (userId) get().fetchTimeEntries(userId);
			},

			setPageSize: (pageSize: number) => {
				set({ pageSize, page: 1 });
				const userId = get()._lastUserId;
				if (userId) get().fetchTimeEntries(userId);
			},
		}),
		{
			name: "time-entries-store",
			skipHydration: true, // Important for Next.js SSR
			partialize: (state) => ({
				pageSize: state.pageSize,
				// Don't persist entries/page/total - they're session-based
			}),
		},
	),
);
