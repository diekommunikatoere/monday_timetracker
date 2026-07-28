// components/dashboard/analytics/AbrechnungTable.tsx
"use client";

import { Table, Center, Loader, Text, Badge, Group, ActionIcon, Stack, Box, SimpleGrid, Card } from "@mantine/core";
import { Fragment, useMemo, useState } from "react";

import { Icon } from "@/components";
import { ColumnDef } from "@/components/ui/tables/types";
import { formatDuration } from "@/lib/utils";
import styles from "@/components/styles/ui/tables/Table.module.css";
import type { AbrechnungBudgetItem } from "@/types/abrechnung";

/**
 * Formats a euro amount for display, matching the `€{value.toFixed(2)}`
 * convention used elsewhere in the admin UI (e.g. role hourly rates).
 * Returns an em dash for `null` (no budget configured / no linked items).
 */
function formatEuro(value: number | null): string {
	if (value === null) return "–";
	return `${value.toFixed(2)} €`;
}

/**
 * Props for {@link AbrechnungTable}.
 *
 * @property items   - The {@link AbrechnungBudgetItem} rows to render.
 * @property loading - Shows a centered `Loader` when there are no rows yet.
 * @property error   - Renders a centered red error message instead of the table.
 */
export interface AbrechnungTableProps {
	items: AbrechnungBudgetItem[];
	loading?: boolean;
	error?: string | null;
}

/**
 * Presentational table for the Abrechnung (budget rollup) view.
 *
 * One row per budget item (e.g. a client/retainer on the "Retainer" board), with
 * budget / tracked cost / remaining budget / utilization / tracked time columns.
 * Rows expand (click the chevron) to a drill-down panel listing the linked job
 * items (with the board they currently live on) and a per-role time breakdown —
 * see `lib/abrechnung.ts` for how these are rolled up.
 *
 * Follows the `ColumnDef`-driven convention used by
 * `components/shared/time-entries/TimeEntryTable.tsx`, extended with a local
 * expand/collapse row state (not something the generic time-entry table needs).
 */
export function AbrechnungTable({ items, loading, error }: AbrechnungTableProps) {
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

	const toggleExpand = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const columns: ColumnDef<AbrechnungBudgetItem>[] = useMemo(
		() => [
			{
				id: "name",
				header: "Budget-Item",
				minWidth: 400,
				cell: ({ row }) => (
					<Group gap="xs" wrap="nowrap">
						<ActionIcon variant="subtle" size="sm" onClick={() => toggleExpand(row.id)} aria-label={expandedIds.has(row.id) ? "Details ausblenden" : "Details anzeigen"}>
							<Icon name={expandedIds.has(row.id) ? "expand_more" : "chevron_right"} size={18} />
						</ActionIcon>
						<Text fw={500} size="sm">
							{row.name}
						</Text>
					</Group>
				),
			},
			{
				id: "budget",
				header: "Budget",
				align: "right",
				minWidth: 110,
				cell: ({ row }) => (
					<Text size="sm" /* ff="var(--font--mono)" */ style={{ letterSpacing: "-2%" }}>
						{formatEuro(row.budgetAmount)}
					</Text>
				),
			},
			{
				id: "cost",
				header: "Agenturleistung",
				align: "right",
				minWidth: 110,
				cell: ({ row }) => (
					<Text size="sm" /* ff="var(--font--mono)" */ style={{ letterSpacing: "-2%" }}>
						{formatEuro(row.totalCost)}
					</Text>
				),
			},
			{
				id: "remaining",
				header: "Verbleibend",
				align: "right",
				minWidth: 80,
				cell: ({ row }) => (
					<Text c={row.remainingBudget !== null && row.remainingBudget < 0 ? "red" : undefined} fw={row.remainingBudget !== null && row.remainingBudget < 0 ? 600 : undefined} size="sm" /* ff="var(--font--mono)" */ style={{ letterSpacing: "-2%" }}>
						{formatEuro(row.remainingBudget)}
					</Text>
				),
			},
			{
				id: "utilization",
				header: "Auslastung",
				align: "right",
				minWidth: 80,
				cell: ({ row }) => {
					return row.utilizationPercent === null ? (
						<Text size="sm" c="dimmed">
							Budget fehlt
						</Text>
					) : (
						<Badge variant="dot" color={row.utilizationPercent > 100 ? "red" : row.utilizationPercent > 90 ? "orange" : row.utilizationPercent > 80 ? "yellow" : "green"} fw={600}>
							{row.utilizationPercent.toFixed(0)}%
						</Badge>
					);
				},
			},
			{
				id: "time",
				header: "Zeit",
				align: "right",
				minWidth: 100,
				cell: ({ row }) => (
					<Text size="sm" /* ff="var(--font--mono)" */ style={{ letterSpacing: "-2%" }}>
						{formatDuration(row.totalSeconds)}
					</Text>
				),
			},
		],
		[expandedIds],
	);

	const visibleColumns = useMemo(() => columns.filter((col) => !col.hidden), [columns]);

	const calculatedMinWidth = useMemo(() => {
		const total = visibleColumns.reduce((sum, col) => {
			const colMinWidth = typeof col.minWidth === "string" ? parseInt(col.minWidth, 10) : col.minWidth || 0;
			return sum + colMinWidth;
		}, 0);

		return total > 0 ? total : undefined;
	}, [visibleColumns]);

	if (error) {
		return (
			<Center p="xl">
				<Text c="red">Fehler: {error}</Text>
			</Center>
		);
	}

	if (loading && items.length === 0) {
		return (
			<Center p="xl">
				<Loader />
			</Center>
		);
	}

	if (items.length === 0) {
		return (
			<Center p="xl">
				<Text c="dimmed">Keine Budget-Items gefunden.</Text>
			</Center>
		);
	}

	return (
		<Table.ScrollContainer minWidth={calculatedMinWidth} maxHeight={750} style={{ flex: 1, width: "100%" }} scrollAreaProps={{ type: "auto", offsetScrollbars: "present" }}>
			<Table stickyHeader highlightOnHover withColumnBorders withRowBorders verticalSpacing="sm" layout="auto" style={{ width: "100%" }} className={styles.table}>
				<Table.Thead className={styles.headerRow}>
					<Table.Tr>
						{columns.map((col) => (
							<Table.Th key={col.id} fw={600} style={{ minWidth: col.minWidth }} ta={col.align || "left"} className={styles.headerCell}>
								{typeof col.header === "function" ? col.header({ data: items }) : col.header}
							</Table.Th>
						))}
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>
					{items.map((item, rowIndex) => (
						<Fragment key={item.id}>
							<Table.Tr className={expandedIds.has(item.id) ? styles.expandedRow : styles.bodyRow}>
								{columns.map((col) => (
									<Table.Td key={col.id} ta={col.align || "left"} style={{ minWidth: col.minWidth }}>
										{col.cell({ row: item, index: rowIndex })}
									</Table.Td>
								))}
							</Table.Tr>
							{expandedIds.has(item.id) && (
								<Table.Tr>
									<Table.Td colSpan={columns.length} style={{ background: "var(--color--background-secondary)" }}>
										<AbrechnungItemDetails item={item} />
									</Table.Td>
								</Table.Tr>
							)}
						</Fragment>
					))}
				</Table.Tbody>
			</Table>
		</Table.ScrollContainer>
	);
}

/** Drill-down panel shown under an expanded budget item: per-role breakdown + linked job items. */
function AbrechnungItemDetails({ item }: { item: AbrechnungBudgetItem }) {
	return (
		<Stack gap="md">
			{item.byRole.length > 0 && (
				<>
					<Box>
						<Text size="sm" fw={600} mb={8}>
							Zeit nach Rolle
						</Text>
						<SimpleGrid type="container" cols={{ base: 1, "500px": 2, "620px": 3, "800px": 4 }} spacing={8}>
							{Object.values(item.byRole).map((role) => (
								<Card key={role.roleId} withBorder padding="sm" radius="sm" style={{ flex: 1, minWidth: "150px", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: "8px", borderColor: "var(--color--border-layout)", backgroundColor: "var(--color--background-primary)" }}>
									<Text size="xs" c={"var(--color--text-secondary)"} fw={600} lh={1}>
										{role.roleName}
									</Text>
									<Text c={"var(--color--text-primary)"} fw={600} size="xs" lh={1}>
										{formatDuration(role.totalSeconds)}
									</Text>
								</Card>
							))}
						</SimpleGrid>
					</Box>
					<hr style={{ borderColor: "var(--color--border-layout)", margin: "8px 0" }} />
				</>
			)}

			<Box>
				<Text size="sm" fw={600} mb={8}>
					Verknüpfte Agentur-Projekte ({item.linkedItems.length})
				</Text>
				{item.linkedItems.length === 0 ? (
					<Text size="sm" c="dimmed">
						Keine verknüpften Agentur-Projekte.
					</Text>
				) : (
					<Table striped withTableBorder withColumnBorders withRowBorders verticalSpacing="sm" layout="auto" style={{ width: "100%" }} className={styles.table}>
						<Table.Thead className={styles.headerRow}>
							<Table.Tr>
								<Table.Th className={styles.headerCell}>
									<Text fw={600} size="xs">
										Projekt{item.linkedItems.length > 1 ? "e" : ""}
									</Text>
								</Table.Th>
								<Table.Th className={styles.headerCell}>
									<Text fw={600} size="xs">
										Board
									</Text>
								</Table.Th>
								<Table.Th className={styles.headerCell}>
									<Text fw={600} size="xs">
										Agenturleistung
									</Text>
								</Table.Th>
							</Table.Tr>
						</Table.Thead>
						<Table.Tbody>
							{item.linkedItems.map((linked) => (
								<Table.Tr key={linked.id} className={styles.bodyRow}>
									<Table.Td>
										<Text fw={500} size="xs">
											{linked.name}
										</Text>
									</Table.Td>
									<Table.Td>
										<Text fw={500} size="xs">
											{linked.board ? linked.board.name : ""}
										</Text>
									</Table.Td>
									<Table.Td>
										<Text size="xs" style={{ letterSpacing: "-2%" }}>
											{/* {formatEuro(linked.totalCost)} */}0 €
										</Text>
									</Table.Td>
								</Table.Tr>
							))}
						</Table.Tbody>
					</Table>
				)}
			</Box>
		</Stack>
	);
}
