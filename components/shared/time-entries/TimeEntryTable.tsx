// components/shared/time-entries/TimeEntryTable.tsx
"use client";

import { Table, Checkbox, Center, Loader, Text } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { useMemo } from "react";
import { ColumnDef } from "@/components/ui/tables/types";
import styles from "@/components/styles/features/time-entries/TimeEntryTable.module.css";

export interface TimeEntryTableProps {
	timeEntries: TimeEntry[];
	columns: ColumnDef<TimeEntry>[];
	loading?: boolean;
	error?: string | null;
	selectedIds?: string[];
	onSelectRow?: (id: string, selected: boolean) => void;
	onSelectAll?: (selected: boolean) => void;
}

export function TimeEntryTable({ timeEntries, columns, loading, error, selectedIds = [], onSelectRow, onSelectAll }: TimeEntryTableProps) {
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

	const visibleColumns = columns.filter((col) => !col.hidden);

	return (
		<Table withTableBorder highlightOnHover withColumnBorders withRowBorders className={styles.timeEntryTable}>
			<Table.Thead>
				<Table.Tr bg="var(--color--background-secondary)" className={styles.headerRow}>
					{visibleColumns.map((col) => (
						<Table.Th key={col.id} fw={600} style={{ width: col.width }} ta={col.align || "left"}>
							{typeof col.header === "function" ? col.header({ data: timeEntries }) : col.header}
						</Table.Th>
					))}
				</Table.Tr>
			</Table.Thead>
			<Table.Tbody>
				{timeEntries.map((entry, rowIndex) => (
					<Table.Tr key={entry.id} className={selectedIds.includes(entry.id) ? styles.selectedPrimary : entry.is_draft ? styles.highlightPrimary : undefined}>
						{visibleColumns.map((col) => (
							<Table.Td key={col.id} ta={col.align || "left"}>
								{col.cell({ row: entry, index: rowIndex })}
							</Table.Td>
						))}
					</Table.Tr>
				))}
			</Table.Tbody>
		</Table>
	);
}
