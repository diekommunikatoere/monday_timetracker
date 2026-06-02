// stores/timeEntriesStore.ts
import { create } from "zustand";
import { TimeEntry } from "@/types/time-entry";
import { useMondayStore } from "./mondayStore";

interface TimeEntriesState {
	// Time entries data
	timeEntries: TimeEntry[];

	// Loading states
	loading: boolean;
	error: string | null;

	// Actions
	fetchTimeEntries: (userId: string) => Promise<void>;
	setTimeEntries: (entries: TimeEntry[]) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	refetch: (userId: string) => Promise<void>;
}

export const useTimeEntriesStore = create<TimeEntriesState>()((set, get) => ({
	timeEntries: [],
	loading: false,
	error: null,

	fetchTimeEntries: async (userId: string) => {
		if (!userId) return;

		const sessionToken = useMondayStore.getState().sessionToken;
		if (!sessionToken) return;

		try {
			set({ loading: true, error: null });
			const response = await fetch("/api/time-entries", {
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});

			if (!response.ok) {
				throw new Error("Fehler beim Laden der Zeiteinträge");
			}

			const data = await response.json();

			// Filter entries with current running timer. They have no end_time and duration of NULL. We don't want to show them in the table, but they should be included in the refetch after saving a draft entry.
			const cleanData = data.filter((entry: TimeEntry) => entry.end_time !== null && entry.duration !== null);

			set({ timeEntries: cleanData, loading: false });
		} catch (err) {
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
	},
}));
