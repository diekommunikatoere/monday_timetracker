"use client";

import { useEffect } from "react";

import { ErrorState, LoadingState } from "@/components";
import TimeEntriesTable from "@/components/dashboard/TimeEntriesTable";
import TimerDashboardHeader from "@/components/features/dashboard/timer/TimerDashboardHeader";
import { TimeEntriesProvider } from "@/contexts/TimeEntriesContext";
import { useMondayStore } from "@/stores/mondayStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useUserStore } from "@/stores/userStore";

export default function DashboardsLayout(props: LayoutProps<"/dashboards">) {
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
		return (
			<div id="dashboard-app">
				<TimerDashboardHeader />
				<LoadingState />
			</div>
		);
	}

	// Show error if Monday initialization failed
	if (mondayError) {
		return <ErrorState message={mondayError} />;
	}

	return (
		<TimeEntriesProvider refetch={() => refetch(userId!)}>
			<div id="dashboard-app">
				<TimerDashboardHeader />
				{mondayError ? (
					<ErrorState message={mondayError} />
				) : mondayLoading ? (
					<LoadingState />
				) : (
					<div id="dashboard-content" style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", flexDirection: "column" }}>
						{props.children}
					</div>
				)}
			</div>
		</TimeEntriesProvider>
	);
}
