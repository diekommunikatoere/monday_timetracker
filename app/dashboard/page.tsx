// app/dashboard/page.tsx
"use client";

import { Logo } from "@/components/Logo";
import AppHeader from "@/components/AppHeader";
import TimeEntriesTable from "@/components/dashboard/TimeEntriesTable";
import { useTimeEntries } from "@/hooks/useTimeEntries";
import { TimeEntriesProvider } from "@/contexts/TimeEntriesContext";

export default function DashboardPage() {
	const { timeEntries, loading, error, refetch } = useTimeEntries();

	return (
		<TimeEntriesProvider refetch={refetch}>
			<div id="dashboard-app">
				<AppHeader variant="dashboard" />
				<main>
					<TimeEntriesTable timeEntries={timeEntries} loading={loading} error={error} onRefetch={refetch} />
				</main>
			</div>
		</TimeEntriesProvider>
	);
}
