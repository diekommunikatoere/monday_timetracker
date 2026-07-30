"use client";

import { useEffect } from "react";

import { TimeEntriesCalendar } from "@/components/dashboard/calendar/TimeEntriesCalendar";
import TimeEntriesTable from "@/components/dashboard/TimeEntriesTable";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useUserStore } from "@/stores/userStore";

export default function DashboardPage() {
	// Get user and time entries state
	const userId = useUserStore((state) => state.supabaseUser?.id);
	const { fetchTimeEntries, refetch } = useTimeEntriesStore();
	const dashboardViewMode = useUserStore((state) => state.dashboardViewMode);

	// Fetch time entries when userId is available
	useEffect(() => {
		if (userId) {
			fetchTimeEntries(userId);
		}
	}, [userId, fetchTimeEntries]);

	function renderViewMode(dashboardViewMode) {
		switch (dashboardViewMode) {
			case "table":
				return <TimeEntriesTable onRefetch={() => refetch(userId!)} />;
			case "calendar":
				return <TimeEntriesCalendar />;
			default:
				return <div>Unknown view mode: {dashboardViewMode}</div>;
		}
	}

	return renderViewMode(dashboardViewMode);
}
