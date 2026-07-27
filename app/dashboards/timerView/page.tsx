"use client";

import { useEffect } from "react";
import TimeEntriesTable from "@/components/dashboard/TimeEntriesTable";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useUserStore } from "@/stores/userStore";

export default function DashboardPage() {
	// Get user and time entries state
	const userId = useUserStore((state) => state.supabaseUser?.id);
	const { fetchTimeEntries, refetch } = useTimeEntriesStore();

	// Fetch time entries when userId is available
	useEffect(() => {
		if (userId) {
			fetchTimeEntries(userId);
		}
	}, [userId, fetchTimeEntries]);

	return <TimeEntriesTable onRefetch={() => refetch(userId!)} />;
}
