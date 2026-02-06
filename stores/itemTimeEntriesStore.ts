// stores/itemTimeEntriesStore.ts
"use client";

import { create } from "zustand";
import { TimeEntry } from "@/types/time-entry";
import { useMondayStore } from "./mondayStore";

export interface ItemTimeEntriesState {
	// Current item context
	itemId: string | null;
	boardId: string | null;

	// Entries data - all users
	timeEntries: TimeEntry[];

	// Aggregations
	totalDuration: number;
	durationByRole: Record<string, { roleId: string; roleName: string; duration: number }>;
	durationByUser: Record<string, { userId: string; userName: string; duration: number }>;

	// Loading states
	loading: boolean;
	error: string | null;

	// Filters
	filters: {
		dateRange: { start: Date | null; end: Date | null };
		roleId: string | null;
		userId: string | null;
	};

	// Actions
	setItemContext: (itemId: string, boardId: string) => void;
	fetchItemTimeEntries: () => Promise<void>;
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

			// The API response structure should match ItemTimeEntriesResponse from plan
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
