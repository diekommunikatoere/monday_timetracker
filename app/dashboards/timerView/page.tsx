"use client";

import { useEffect } from "react";
import TimerDashboardHeader from "@/components/features/dashboard/timer/TimerDashboardHeader";
import TimeEntriesTable from "@/components/dashboard/TimeEntriesTable";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import { TimeEntriesProvider } from "@/contexts/TimeEntriesContext";

export default function DashboardPage() {
	// Get user and time entries state
	const userId = useUserStore((state) => state.supabaseUser?.id);
	const { fetchTimeEntries, refetch } = useTimeEntriesStore();

	// Initialize Monday context (which sets up user authentication)
	const { initializeMondayContext, isLoading: mondayLoading, error: mondayError } = useMondayStore();

	// Initialize Monday context on mount
	useEffect(() => {
		initializeMondayContext().catch((err) => console.error("Error initializing Monday context:", err));
	}, [initializeMondayContext]);

	// Fetch time entries when userId is available
	useEffect(() => {
		if (userId) {
			fetchTimeEntries(userId);
		}
	}, [userId, fetchTimeEntries]);

	// Show loading state while initializing
	if (mondayLoading) {
		return <div>Wird initialisiert...</div>;
	}

	// Show error if Monday initialization failed
	if (mondayError) {
		return <div>Fehler: {mondayError}</div>;
	}

	return (
		<TimeEntriesProvider refetch={() => refetch(userId!)}>
			<div id="dashboard-app">
				<TimerDashboardHeader variant="dashboard" />
				<TimeEntriesTable onRefetch={() => refetch(userId!)} />
			</div>
		</TimeEntriesProvider>
	);
}
