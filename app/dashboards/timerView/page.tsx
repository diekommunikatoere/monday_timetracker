"use client";

import { useEffect } from "react";
import TimerDashboardHeader from "@/components/features/dashboard/timer/TimerDashboardHeader";
import TimeEntriesTable from "@/components/dashboard/TimeEntriesTable";
import { Flex } from "@mantine/core";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import { TimeEntriesProvider } from "@/contexts/TimeEntriesContext";
import { APP_VERSION } from "@/lib/version";

export default function DashboardPage() {
	// Get user and time entries state
	const userId = useUserStore((state) => state.supabaseUser?.id);
	const { timeEntries, loading, error, fetchTimeEntries, refetch } = useTimeEntriesStore();

	// Initialize Monday context (which sets up user authentication)
	const { initializeMondayContext, isLoading: mondayLoading, error: mondayError } = useMondayStore();

	// Initialize Monday context on mount
	useEffect(() => {
		initializeMondayContext()
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
				<TimeEntriesTable timeEntries={timeEntries} loading={loading} error={error} onRefetch={() => refetch(userId!)} />
				<Flex style={{ position: "fixed", bottom: 10, right: 10, fontFamily: "var(--font--mono)", fontSize: "12px", lineHeight: "1", backgroundColor: "var(--color--background-secondary)", padding: "4px 8px", borderRadius: "4px", borderWidth: "1px", borderColor: "var(--color--primary)" }} direction="column" align="flex-end" gap="xs">
					<span>v{APP_VERSION}</span>
				</Flex>
			</div>
		</TimeEntriesProvider>
	);
}
