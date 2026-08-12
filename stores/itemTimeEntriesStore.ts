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
	durationByUser: Record<string, { userId: string; userName: string; duration: number }>;

	loading: boolean;
	error: string | null;

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
	error: null,
	filters: {
		dateRange: { start: null, end: null },
		roleId: null,
		userId: null,
	},

	setItemContext: (itemId, boardId) => {
		set({ itemId, boardId });
	},

	fetchItemTimeEntries: async () => {
		const { itemId, boardId, filters } = get();
		if (!itemId || !boardId) return;

		const sessionToken = useMondayStore.getState().sessionToken;
		if (!sessionToken) return;

		try {
			set({ loading: true, error: null });

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

			// Flatten the API's byRole/byUser arrays into lookup maps keyed by id.
			set({
				timeEntries: data.entries,
				totalDuration: data.aggregations.totalDuration,
				durationByRole: data.aggregations.byRole.reduce((acc: any, curr: any) => {
					acc[curr.roleId] = { roleId: curr.roleId, roleName: curr.roleName, duration: curr.totalDuration };
					return acc;
				}, {}),
				durationByUser: data.aggregations.byUser.reduce((acc: any, curr: any) => {
					acc[curr.userId] = { userId: curr.userId, userName: curr.userName, duration: curr.totalDuration };
					return acc;
				}, {}),
				loading: false,
			});
		} catch (err) {
			set({
				error: err instanceof Error ? err.message : "Unbekannter Fehler",
				loading: false,
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
