// components/shared/time-entries/TimeEntryTable.tsx
"use client";

import { Table, Center, Loader, Text } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { useMemo } from "react";
import { ColumnDef } from "@/components/ui/tables/types";
import styles from "@/components/styles/features/time-entries/TimeEntryTable.module.css";

/**
 * Props for {@link TimeEntryTable}.
 *
 * @property timeEntries  - The {@link TimeEntry} rows to render; `duration` on each is in **seconds**.
 * @property columns      - Column definitions (see `ColumnDef` from `@/components/ui/tables/types`); produced by {@link getDashboardColumns} / {@link getSidebarColumns} in `TimeEntryTableConfigs`.
 * @property loading      - When truthy, renders a centered `Loader` instead of the table.
 * @property error        - When non-null, renders a centered red error message instead of the table.
 * @property selectedIds  - Ids currently selected via row checkboxes; drives row highlight and the select-all indeterminate state.
 * @property onSelectRow  - Optional row-checkbox callback `(id, selected)`.
 * @property onSelectAll  - Optional header-checkbox callback `(selected)`.
 * @property minWidth     - Optional explicit table minimum width (string or number); when omitted it is summed from each visible column's `minWidth`.
 * @property scrollable   - When true, wraps the table in a `ScrollContainer` using `calculatedMinWidth`.
 */
export interface TimeEntryTableProps {
	timeEntries: TimeEntry[];
	columns: ColumnDef<TimeEntry>[];
	loading?: boolean;
	error?: string | null;
	selectedIds?: string[];
	onSelectRow?: (id: string, selected: boolean) => void;
	onSelectAll?: (selected: boolean) => void;
	minWidth?: string | number;
	scrollable?: boolean;
}

/**
 * Presentational table renderer for a list of {@link TimeEntry} rows.
 *
 * Expects fully-built {@link ColumnDef}s (it does not define its own columns —
 * see {@link TimeEntryTableConfigs}). Hides any column flagged `col.hidden`,
 * and computes three derived values: the header select-all checkbox state
 * (`checked` / `indeterminate`), the visible column list, and a `minWidth`
 * either taken from props or summed from visible columns. Renders distinct
 * empty states for loading, error, and "no rows". Draft rows
 * (`entry.is_draft`) are highlighted, and selected rows get a stronger
 * highlight via the `TimeEntryTable.module.css` styles.
 *
 * @param props - {@link TimeEntryTableProps}.
 * @returns A Mantine `Table` (optionally inside a `ScrollContainer`), or one of the loading/error/empty states.
 */
export function TimeEntryTable({ timeEntries, columns, loading, error, selectedIds = [], onSelectRow, onSelectAll, minWidth, scrollable }: TimeEntryTableProps) {
	const selectAllState = useMemo(() => {
		const total = timeEntries.length;
		const selected = selectedIds.length;
		return {
			checked: total > 0 && selected === total,
			indeterminate: selected > 0 && selected < total,
		};
	}, [selectedIds, timeEntries.length]);

	const visibleColumns = useMemo(() => columns.filter((col) => !col.hidden), [columns]);

	const calculatedMinWidth = useMemo(() => {
		if (minWidth) return minWidth;

		const total = visibleColumns.reduce((sum, col) => {
			const colMinWidth = typeof col.minWidth === "string" ? parseInt(col.minWidth, 10) : col.minWidth || 0;
			return sum + colMinWidth;
		}, 0);

		return total > 0 ? total : undefined;
	}, [visibleColumns, minWidth]);

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

	const renderTable = () => (
		<Table withTableBorder highlightOnHover withColumnBorders withRowBorders stickyHeader verticalSpacing="sm" className={styles.timeEntryTable} layout="auto" style={{ width: "100%", minWidth: "100%" }}>
			<Table.Thead>
				<Table.Tr className={styles.headerRow}>
					{visibleColumns.map((col) => (
						<Table.Th key={col.id} fw={600} style={{ width: col.width, maxWidth: col.maxWidth, minWidth: col.minWidth }} ta={col.align || "left"}>
							{typeof col.header === "function" ? col.header({ data: timeEntries }) : col.header}
						</Table.Th>
					))}
				</Table.Tr>
			</Table.Thead>
			<Table.Tbody>
				{timeEntries.map((entry, rowIndex) => (
					<Table.Tr key={entry.id} className={selectedIds.includes(entry.id) ? styles.selectedPrimary : entry.is_draft ? styles.highlightPrimary : undefined}>
						{visibleColumns.map((col) => (
							<Table.Td key={col.id} ta={col.align || "left"} style={{ lineHeight: 1, width: col.width, maxWidth: col.maxWidth, minWidth: col.minWidth }}>
								{col.cell({ row: entry, index: rowIndex })}
							</Table.Td>
						))}
					</Table.Tr>
				))}
			</Table.Tbody>
		</Table>
	);

	if (scrollable) {
		return (
			<Table.ScrollContainer minWidth={calculatedMinWidth} maxHeight={"100%"} style={{ flex: 1, width: "100%" }} scrollAreaProps={{ type: "auto", offsetScrollbars: "present" }}>
				{renderTable()}
			</Table.ScrollContainer>
		);
	} else {
		return renderTable();
	}
}
