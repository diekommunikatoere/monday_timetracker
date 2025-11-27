// components/dashboard/TimeEntriesTable.tsx
"use client";

import { useState, useMemo } from "react";
import { useUserStore } from "@/stores/userStore";
import { useTimerStore, useTimerComputed } from "@/stores/timerStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { Table, Checkbox, Text, Center, Loader } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { formatDuration } from "@/lib/utils";

interface TimeEntriesTableProps {
	timeEntries?: TimeEntry[];
	loading?: boolean;
	error?: string | null;
	onRefetch: () => void;
}

export default function TimeEntriesTable({ onRefetch }: TimeEntriesTableProps) {
	const { timeEntries, loading, error } = useTimeEntriesStore();
	const [selectedIds, setSelectedIds] = useState<string[]>([]);

	// Use new timer store selectors
	const elapsedTime = useTimerStore((s) => s.elapsedTime);
	const sessionId = useTimerStore((s) => s.sessionId);
	const draftId = useTimerStore((s) => s.draftId);
	const { isActive, isPaused, hasSession } = useTimerComputed();

	const userId = useUserStore((state) => state.supabaseUser?.id);

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

	if (loading) {
		return (
			<Center p="xl">
				<Loader />
			</Center>
		);
	}

	if (error) {
		return (
			<Center p="xl">
				<Text c="dki-error">Error: {error}</Text>
			</Center>
		);
	}

	if (timeEntries.length === 0) {
		return (
			<Center p="xl">
				<Text>Keine Zeiteinträge gefunden.</Text>
			</Center>
		);
	}

	return (
		<Table striped highlightOnHover>
			<Table.Thead>
				<Table.Tr>
					<Table.Th style={{ width: 40 }}>
						<Checkbox checked={selectAllState.checked} indeterminate={selectAllState.indeterminate} onChange={(e) => handleSelectAll(e.currentTarget.checked)} aria-label="Alle Zeiteinträge auswählen" />
					</Table.Th>
					<Table.Th fw={600}>Aufgabe</Table.Th>
					<Table.Th fw={600}>Rolle</Table.Th>
					<Table.Th fw={600}>Board</Table.Th>
					<Table.Th fw={600}>Job</Table.Th>
					<Table.Th fw={600}>Kommentar</Table.Th>
					<Table.Th fw={600}>Datum</Table.Th>
					<Table.Th fw={600}>Start</Table.Th>
					<Table.Th fw={600}>Ende</Table.Th>
					<Table.Th fw={600}>Gesamtzeit</Table.Th>
				</Table.Tr>
			</Table.Thead>
			<Table.Tbody>
				{timeEntries.map((entry) => (
					<Table.Tr key={entry.id} bg={selectedIds.includes(entry.id.toString()) ? "dki-secondary" : undefined}>
						<Table.Td>
							<Checkbox checked={selectedIds.includes(entry.id.toString())} onChange={(e) => handleRowSelect(entry.id.toString(), e.currentTarget.checked)} aria-label={`Select time entry ${entry.id}`} />
						</Table.Td>
						<Table.Td>{entry.task_name}</Table.Td>
						<Table.Td>{entry.role_name || "-"}</Table.Td>
						<Table.Td>{entry.board_name || "-"}</Table.Td>
						<Table.Td>{entry.item_name || "-"}</Table.Td>
						<Table.Td>{entry.comment || "-"}</Table.Td>
						<Table.Td>{new Date(entry.start_time).toLocaleDateString()}</Table.Td>
						<Table.Td>{new Date(entry.start_time).toLocaleTimeString()}</Table.Td>
						<Table.Td>{new Date(entry.end_time).toLocaleTimeString()}</Table.Td>
						<Table.Td>{formatDuration(entry.duration)}</Table.Td>
					</Table.Tr>
				))}
			</Table.Tbody>
		</Table>
	);
}
