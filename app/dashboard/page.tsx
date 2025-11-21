// app/dashboard/page.tsx
"use client";

import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import AppHeader from "@/components/AppHeader";
import TimeEntriesTable from "@/components/dashboard/TimeEntriesTable";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import { TimeEntriesProvider } from "@/contexts/TimeEntriesContext";

export default function DashboardPage() {
	// Get user and time entries state
	const userId = useUserStore((state) => state.supabaseUser?.id);
	const { timeEntries, loading, error, fetchTimeEntries, refetch } = useTimeEntriesStore();

	// Initialize Monday context (which sets up user authentication)
	const { initializeMondayContext, isLoading: mondayLoading, error: mondayError } = useMondayStore();

	// Initialize Monday context on mount
	useEffect(() => {
		console.log("Initializing Monday context...");
		initializeMondayContext()
			.then(() => {
				console.log("Monday user initialized: ", useUserStore.getState().mondayUser);
				console.log("Supabase user initialized: ", useUserStore.getState().supabaseUser);
				console.log("Monday context initialization complete.");
			})
			.catch((err) => console.error("Error initializing Monday context:", err));
	}, [initializeMondayContext]);

	// Fetch time entries when userId is available
	useEffect(() => {
		if (userId) {
			fetchTimeEntries(userId);
		}
	}, [userId, fetchTimeEntries]);

	// Show loading state while initializing
	if (mondayLoading) {
		return <div>Initializing...</div>;
	}

	// Show error if Monday initialization failed
	if (mondayError) {
		return <div>Error: {mondayError}</div>;
	}

	return (
		<TimeEntriesProvider refetch={() => refetch(userId!)}>
			<div id="dashboard-app">
				<AppHeader variant="dashboard" />
				<TimeEntriesTable timeEntries={timeEntries} loading={loading} error={error} onRefetch={() => refetch(userId!)} />
			</div>
		</TimeEntriesProvider>
	);
}
