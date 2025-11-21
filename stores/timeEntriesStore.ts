// stores/timeEntriesStore.ts
import { create } from "zustand";
import { TimeEntry } from "@/types/time-entry";

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

		try {
			set({ loading: true, error: null });
			const response = await fetch(`/api/time-entries?mondayUserId=${userId}`);
			
			if (!response.ok) {
				throw new Error("Failed to fetch time entries");
			}

			const data = await response.json();
			set({ timeEntries: data, loading: false });
		} catch (err) {
			set({
				error: err instanceof Error ? err.message : "Unknown error",
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
