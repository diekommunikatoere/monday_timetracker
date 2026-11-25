"use client";

import { create } from "zustand";

import { TimeEntry } from "@/types/time-entry";

import { useMondayStore } from "./mondayStore";

/**
 * Time entries for a single monday item (the sidebar item view), across all users.
 * Where `timeEntriesStore` holds the current user's dashboard list, this store is
 * scoped to one item/board and exposes per-role and per-user aggregations. Set the
 * item context first, then fetch. Not persisted.
 */
export interface ItemTimeEntriesState {
	/** The monday item these entries belong to. */
	itemId: string | null;
	/** The board that owns the item. */
	boardId: string | null;

	/** All entries for the item, from every user. */
	timeEntries: TimeEntry[];

	/** Total tracked seconds across all entries. */
	totalDuration: number;
	/** Duration totals keyed by role id. */
	durationByRole: Record<string, { roleId: string; roleName: string; duration: number }>;
	/** Duration totals keyed by user id. */
	durationByUser: Record<string, { userId: string; userName: string; duration: number; isActive?: boolean }>;

	/** True only during the initial fetch before entries have loaded for the current item. */
	loading: boolean;
	/** True during background refetches once initial data has loaded. */
	refreshing: boolean;
	error: string | null;

	/** Internal: whether entries have loaded at least once for the current `itemId`. */
	_hasLoaded: boolean;
	/** Internal: monotonic latest-wins guard for concurrent fetches. */
	_requestId: number;

	/** Active filters; changing them via `setFilters` triggers a refetch. */
	filters: {
		dateRange: { start: Date | null; end: Date | null };
		roleId: string | null;
		userId: string | null;
	};

	/** Set the item/board this store is scoped to. Call before fetching. */
	setItemContext: (itemId: string, boardId: string) => void;
	/** Load entries + aggregations from `GET /api/items/:itemId/time-entries`. No-op until the item context and a session token are set. */
	fetchItemTimeEntries: () => Promise<void>;
	/** Merge in new filter values and refetch. */
	setFilters: (filters: Partial<ItemTimeEntriesState["filters"]>) => void;
	refetch: () => Promise<void>;
}

export const useItemTimeEntriesStore = create<ItemTimeEntriesState>()((set, get) => ({
	itemId: null,
	boardId: null,
	timeEntries: [],
	totalDuration: 0,
	durationByRole: {},
	durationByUser: {},
	loading: false,
	refreshing: false,
	error: null,
	_hasLoaded: false,
	_requestId: 0,
	filters: {
		dateRange: { start: null, end: null },
		roleId: null,
		userId: null,
	},

	setItemContext: (itemId, boardId) => {
		set((state) =>
			state.itemId === itemId
				? { itemId, boardId }
				: {
						itemId,
						boardId,
						timeEntries: [],
						totalDuration: 0,
						durationByRole: {},
						durationByUser: {},
						_hasLoaded: false,
					},
		);
	},

	fetchItemTimeEntries: async () => {
		const { itemId, boardId, filters } = get();
		if (!itemId || !boardId) return;

		const sessionToken = useMondayStore.getState().sessionToken;
		if (!sessionToken) return;

		const requestId = get()._requestId + 1;
		const isInitialLoad = !get()._hasLoaded;

		try {
			set({ loading: isInitialLoad, refreshing: !isInitialLoad, error: null, _requestId: requestId });

			const params = new URLSearchParams({
				boardId,
			});
			if (filters.dateRange.start) params.append("startDate", filters.dateRange.start.toISOString());
			if (filters.dateRange.end) params.append("endDate", filters.dateRange.end.toISOString());

			const response = await fetch(`/api/items/${itemId}/time-entries?${params.toString()}`, {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});

			if (!response.ok) {
				throw new Error("Fehler beim Laden der Zeiteinträge für dieses Item");
			}

			const data = await response.json();

			if (get()._requestId !== requestId) return;

			// Flatten the API's byRole/byUser arrays into lookup maps keyed by id.
			set({
				timeEntries: data.entries,
				totalDuration: data.aggregations.totalDuration,
				durationByRole: data.aggregations.byRole.reduce((acc: any, curr: any) => {
					acc[curr.roleId] = { roleId: curr.roleId, roleName: curr.roleName, duration: curr.totalDuration };
					return acc;
				}, {}),
				durationByUser: data.aggregations.byUser.reduce((acc: any, curr: any) => {
					acc[curr.userId] = {
						userId: curr.userId,
						userName: curr.userName,
						duration: curr.totalDuration,
						isActive: curr.isActive ?? true,
					};
					return acc;
				}, {}),
				loading: false,
				refreshing: false,
				_hasLoaded: true,
			});
		} catch (err) {
			if (get()._requestId !== requestId) return;

			set({
				error: err instanceof Error ? err.message : "Unbekannter Fehler",
				loading: false,
				refreshing: false,
			});
		}
	},

	setFilters: (newFilters) => {
		set((state) => ({
			filters: { ...state.filters, ...newFilters },
		}));
		get().fetchItemTimeEntries();
	},

	refetch: async () => {
		await get().fetchItemTimeEntries();
	},
}));
