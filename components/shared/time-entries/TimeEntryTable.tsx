// components/shared/time-entries/TimeEntryTable.tsx
"use client";

import { Table, Checkbox, Center, Loader, Text } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { TimeEntryRow } from "./TimeEntryRow";
import { useMemo } from "react";

export interface TimeEntryTableProps {
	timeEntries: TimeEntry[];
	loading?: boolean;
	error?: string | null;
	selectedIds: string[];
	onSelectRow: (id: string, selected: boolean) => void;
	onSelectAll: (selected: boolean) => void;
	onEdit?: (entry: TimeEntry) => void;
	onDelete?: (entry: TimeEntry) => void;
	currentUserId: string | undefined;
	showUserColumn?: boolean;
	showCheckbox?: boolean;
}

export function TimeEntryTable({ timeEntries, loading, error, selectedIds, onSelectRow, onSelectAll, onEdit, onDelete, currentUserId, showCheckbox = false, showUserColumn = false }: TimeEntryTableProps) {
	const selectAllState = useMemo(() => {
		const total = timeEntries.length;
		const selected = selectedIds.length;
		return {
			checked: total > 0 && selected === total,
			indeterminate: selected > 0 && selected < total,
		};
	}, [selectedIds, timeEntries.length]);

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
				<Text c="red">Error: {error}</Text>
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
		<Table striped highlightOnHover withColumnBorders withTableBorder withRowBorders>
			<Table.Thead>
				<Table.Tr bg="white">
					{showCheckbox && (
						<Table.Th style={{ width: 40 }}>
							<Checkbox checked={selectAllState.checked} indeterminate={selectAllState.indeterminate} onChange={(e) => onSelectAll(e.currentTarget.checked)} aria-label="Alle Zeiteinträge auswählen" />
						</Table.Th>
					)}
					{showUserColumn && <Table.Th fw={600}>Benutzer</Table.Th>}
					<Table.Th fw={600}>Rolle</Table.Th>
					<Table.Th fw={600}>Kommentar</Table.Th>
					<Table.Th fw={600}>Datum</Table.Th>
					<Table.Th fw={600}>Start</Table.Th>
					<Table.Th fw={600}>Ende</Table.Th>
					<Table.Th fw={600}>Gesamtzeit</Table.Th>
				</Table.Tr>
			</Table.Thead>
			<Table.Tbody>
				{timeEntries.map((entry) => (
					<TimeEntryRow key={entry.id} entry={entry} currentUserId={currentUserId} isSelected={selectedIds.includes(entry.id)} onSelect={onSelectRow} onEdit={onEdit} onDelete={onDelete} showUserColumn={showUserColumn} showCheckbox={showCheckbox} />
				))}
			</Table.Tbody>
		</Table>
	);
}
