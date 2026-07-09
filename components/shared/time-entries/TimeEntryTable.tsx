// components/shared/time-entries/TimeEntryTable.tsx
"use client";

import { Table, Center, Loader, Text, Box, LoadingOverlay } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { useMemo } from "react";
import { ColumnDef } from "@/components/ui/tables/types";
import styles from "@/components/styles/features/time-entries/TimeEntryTable.module.css";

/**
 * Props for {@link TimeEntryTable}.
 *
 * @property timeEntries  - The {@link TimeEntry} rows to render; `duration` on each is in **seconds**.
 * @property columns      - Column definitions (see `ColumnDef` from `@/components/ui/tables/types`); produced by {@link getDashboardColumns} / {@link getSidebarColumns} in `TimeEntryTableConfigs`.
 * @property loading      - When truthy: shows a centered `Loader` if there are no rows yet (initial load), or a `LoadingOverlay` over the existing rows if a page/pageSize refetch is in flight — the table stays mounted so the layout doesn't collapse.
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
 * either taken from props or summed from visible columns. Renders a centered
 * error message when `error` is set, and a "no rows" empty state when there
 * are no entries and nothing is loading. A `loading` initial load (no rows yet)
 * shows a centered `Loader`; a `loading` refetch with existing rows keeps the
 * table mounted and dims it with a `LoadingOverlay` instead, so pagination
 * doesn't collapse/restore the surrounding layout. Draft rows
 * (`entry.timer_state !== "finalized"`) are highlighted, and selected rows get a stronger
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

	const hasRows = timeEntries.length > 0;

	if (error) {
		return (
			<Center p="xl" style={{ flex: 1 }}>
				<Text c="red">Error: {error}</Text>
			</Center>
		);
	}

	// Only block the whole table on the initial load (no rows yet). A refetch
	// over existing rows (e.g. changing page/pageSize) instead falls through to
	// the table below with a `LoadingOverlay`, so the layout doesn't collapse
	// and restore on every page change.
	if (loading && !hasRows) {
		return (
			<Center p="xl" style={{ flex: 1 }}>
				<Loader />
			</Center>
		);
	}

	if (!hasRows) {
		return (
			<>
				<Table withTableBorder highlightOnHover withColumnBorders withRowBorders stickyHeader verticalSpacing="sm" className={styles.timeEntryTable} layout="auto" style={{ width: "100%", minWidth: "100%" }}>
					<Table.Thead className={styles.headerRow}>
						<Table.Tr>
							{visibleColumns.map((col) => (
								<Table.Th key={col.id} fw={600} style={{ width: col.width, maxWidth: col.maxWidth, minWidth: col.minWidth }} ta={col.align || "left"}>
									{typeof col.header === "function" ? col.header({ data: timeEntries }) : col.header}
								</Table.Th>
							))}
						</Table.Tr>
					</Table.Thead>
				</Table>
				<Center p="xl" style={{ flex: 1 }}>
					<Text>Keine Zeiteinträge gefunden.</Text>
				</Center>
			</>
		);
	}

	const renderTable = () => (
		<Table withTableBorder highlightOnHover withColumnBorders withRowBorders stickyHeader verticalSpacing="sm" className={styles.timeEntryTable} layout="auto" style={{ width: "100%", minWidth: "100%" }}>
			<Table.Thead className={styles.headerRow}>
				<Table.Tr>
					{visibleColumns.map((col) => (
						<Table.Th key={col.id} fw={600} style={{ width: col.width, maxWidth: col.maxWidth, minWidth: col.minWidth }} ta={col.align || "left"}>
							{typeof col.header === "function" ? col.header({ data: timeEntries }) : col.header}
						</Table.Th>
					))}
				</Table.Tr>
			</Table.Thead>
			<Table.Tbody>
				{timeEntries.map((entry, rowIndex) => (
					<Table.Tr key={entry.id} className={selectedIds.includes(entry.id) ? styles.selectedPrimary : entry.timer_state !== "finalized" ? styles.highlightPrimary : undefined}>
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

	return (
		<Box pos="relative" style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", flexDirection: "column" }}>
			<LoadingOverlay visible={!!loading} zIndex={5} overlayProps={{ backgroundOpacity: 0.35, blur: 1 }} />
			{scrollable ? (
				<Table.ScrollContainer minWidth={calculatedMinWidth} maxHeight={"100%"} style={{ flex: 1, width: "100%" }} scrollAreaProps={{ type: "auto", offsetScrollbars: "present" }}>
					{renderTable()}
				</Table.ScrollContainer>
			) : (
				renderTable()
			)}
		</Box>
	);
}
