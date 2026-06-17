import { create } from "zustand";
import { TimeEntry } from "@/types/time-entry";
import { useMondayStore } from "./mondayStore";

/**
 * The current user's finalized time entries, as rendered in the dashboard table.
 * The store never fetches on its own — call `fetchTimeEntries` from an effect.
 * Not persisted.
 */
interface TimeEntriesState {
	timeEntries: TimeEntry[];
	loading: boolean;
	error: string | null;

	/**
	 * Load the current user's entries from `GET /api/time-entries`. No-op without
	 * a monday session token. The in-progress timer entry is filtered out (see impl).
	 */
	fetchTimeEntries: (userId: string) => Promise<void>;
	setTimeEntries: (entries: TimeEntry[]) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	/** Re-run `fetchTimeEntries`; call after saving a draft to refresh the table. */
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

			// The running timer's entry has no end_time and a NULL duration. Exclude it
			// from the table here, but it stays server-side so a refetch after saving a
			// draft still picks it up once finalized.
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
