// hooks/useTimeEntries.ts
import { useState, useEffect, useCallback } from "react";
import { TimeEntry } from "@/types/time-entry";
import { useMondayContext } from "@/hooks/useMondayContext";

export function useTimeEntries() {
	const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const userId = useMondayContext().getUserId();

	const fetchTimeEntries = useCallback(async () => {
		if (!userId) return;

		try {
			setLoading(true);
			const response = await fetch(`/api/time-entries?mondayUserId=${userId}`);
			if (!response.ok) {
				throw new Error("Failed to fetch time entries");
			}
			const data = await response.json();
			setTimeEntries(data);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}, [userId]);

	useEffect(() => {
		fetchTimeEntries();
	}, [fetchTimeEntries]);

	return { timeEntries, loading, error, refetch: fetchTimeEntries };
}
