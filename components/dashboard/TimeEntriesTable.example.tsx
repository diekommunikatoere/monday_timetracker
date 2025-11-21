"use client";

/**
 * EXAMPLE: TimeEntriesTable component updated to use new store pattern
 * This shows how to migrate from hooks to stores
 * 
 * Changes from original:
 * - Uses useTimeEntriesStore instead of useTimeEntries hook
 * - Uses useHydration to prevent hydration mismatches
 * - Fetches data in useEffect after component mounts
 */

import { useState, useEffect, useMemo } from "react";
import { useUserStore } from "@/stores/userStore";
import { useTimerStore } from "@/stores/timerStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useHydration } from "@/lib/store-utils";
import { Table, TableHeader, TableHeaderCell, TableBody, TableRow, TableCell, Checkbox } from "@vibe/core";
import { formatDuration } from "@/lib/utils";

export default function TimeEntriesTableExample() {
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	
	// Hydration check for SSR safety
	const hydrated = useHydration();
	
	// Get user ID from store
	const userId = useUserStore((state) => state.supabaseUser?.id);
	
	// Get timer state
	const { elapsedTime, startTimer, pauseTimer, resetTimer, softResetTimer, isPaused, draftId, sessionId } = useTimerStore();
	
	// Get time entries from store
	const { timeEntries, loading, error, fetchTimeEntries, refetch } = useTimeEntriesStore();

	// Fetch time entries when user ID is available
	useEffect(() => {
		if (userId) {
			fetchTimeEntries(userId);
		}
	}, [userId, fetchTimeEntries]);

	const columns = [
		{
			id: "selection",
			title: "",
			loadingStateType: "circle",
			width: 40,
		},
		{
			id: "task",
			title: "Aufgabe",
			loadingStateType: "medium-text",
		},
		{
			id: "board",
			title: "Board",
			loadingStateType: "medium-text",
		},
		{
			id: "job",
			title: "Job",
			loadingStateType: "medium-text",
		},
		{
			id: "comment",
			title: "Kommentar",
			loadingStateType: "medium-text",
		},
		{
			id: "date",
			title: "Datum",
			loadingStateType: "medium-text",
			width: 150,
		},
		{
			id: "start",
			title: "Start",
			loadingStateType: "medium-text",
			width: 100,
		},
		{
			id: "end",
			title: "Ende",
			loadingStateType: "medium-text",
			width: 100,
		},
		{
			id: "totalTime",
			title: "Gesamtzeit",
			loadingStateType: "medium-text",
			width: 120,
		},
	];

	// Selection logic
	const selectAllState = useMemo(() => {
		const total = timeEntries.length;
		const selected = selectedIds.length;
		return {
			checked: total > 0 && selected === total,
			indeterminate: selected > 0 && selected < total,
		};
	}, [selectedIds, timeEntries.length]);

	const handleSelectAll = (checked: boolean) => {
		if (checked) {
			setSelectedIds(timeEntries.map((entry) => entry.id.toString()));
		} else {
			setSelectedIds([]);
		}
	};

	const handleRowSelect = (entryId: string, checked: boolean) => {
		if (checked) {
			setSelectedIds((prev) => [...prev, entryId]);
		} else {
			setSelectedIds((prev) => prev.filter((id) => id !== entryId));
		}
	};

	const handleRefresh = () => {
		if (userId) {
			refetch(userId);
		}
	};

	// Show loading state during SSR and initial hydration
	if (!hydrated) {
		return <div>Initializing...</div>;
	}

	if (loading) {
		return <div>Loading time entries...</div>;
	}

	if (error) {
		return (
			<div>
				<div>Error: {error}</div>
				<button onClick={handleRefresh}>Retry</button>
			</div>
		);
	}

	return (
		<div>
			<div style={{ marginBottom: "1rem" }}>
				<button onClick={handleRefresh}>Refresh Entries</button>
			</div>
			<Table columns={columns} emptyState={<h1 style={{ textAlign: "center" }}>No Time Entries</h1>} errorState={<h1 style={{ textAlign: "center" }}>Error State</h1>} id="time-entries-table">
				<TableHeader>
					<TableHeaderCell title={<Checkbox checked={selectAllState.checked} indeterminate={selectAllState.indeterminate} onChange={(e) => handleSelectAll(e.target.checked)} ariaLabel="Alle Zeiteinträge auswählen" />} sticky />
					<TableHeaderCell title="Aufgabe" sticky />
					<TableHeaderCell title="Board" sticky />
					<TableHeaderCell title="Job" sticky />
					<TableHeaderCell title="Kommentar" sticky />
					<TableHeaderCell title="Datum" sticky />
					<TableHeaderCell title="Start" sticky />
					<TableHeaderCell title="Ende" sticky />
					<TableHeaderCell title="Gesamtzeit" sticky />
				</TableHeader>
				<TableBody>
					{timeEntries.map((entry) => (
						<TableRow key={entry.id} highlighted={selectedIds.includes(entry.id.toString())}>
							<TableCell sticky>
								<Checkbox checked={selectedIds.includes(entry.id.toString())} onChange={(e) => handleRowSelect(entry.id.toString(), e.target.checked)} ariaLabel={`Select time entry ${entry.id}`} />
							</TableCell>
							<TableCell sticky>{entry.task_name}</TableCell>
							<TableCell>{entry.board_id || "-"}</TableCell>
							<TableCell>{entry.role || "-"}</TableCell>
							<TableCell>{entry.comment || "-"}</TableCell>
							<TableCell>{new Date(entry.start_time).toLocaleDateString()}</TableCell>
							<TableCell>{new Date(entry.start_time).toLocaleTimeString()}</TableCell>
							<TableCell>{new Date(entry.end_time).toLocaleTimeString()}</TableCell>
							<TableCell>{formatDuration(entry.duration)}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
