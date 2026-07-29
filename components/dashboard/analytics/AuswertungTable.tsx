// components/dashboard/analytics/AuswertungTable.tsx
"use client";

import { Table, Center, Loader, Text, Avatar, Group, ActionIcon, Stack, Box, SimpleGrid, Card } from "@mantine/core";
import { Fragment, useMemo, useState } from "react";

import { Icon } from "@/components";
import styles from "@/components/styles/ui/tables/Table.module.css";
import { ColumnDef } from "@/components/ui/tables/types";
import { formatDuration } from "@/lib/utils";
import type { AuswertungRoleBreakdown, AuswertungUserRow } from "@/types/auswertung";

/** Dims a duration cell when its value is `0` so real numbers stand out. */
function DurationCell({ seconds, fw }: { seconds: number; fw?: number }) {
	return (
		<Text size="sm" fw={fw} c={seconds === 0 ? "var(--color--text-secondary)" : undefined} style={{ letterSpacing: "-2%" }}>
			{formatDuration(seconds)}
		</Text>
	);
}

/**
 * Props for {@link AuswertungTable}.
 *
 * @property items   - The {@link AuswertungUserRow} rows to render (already filtered/sorted).
 * @property loading - Shows a centered `Loader` when there are no rows yet.
 * @property error   - Renders a centered red error message instead of the table.
 */
export interface AuswertungTableProps {
	items: AuswertungUserRow[];
	loading?: boolean;
	error?: string | null;
}

/**
 * Presentational table for the Auswertung (per-user weekly utilization) view.
 *
 * One row per user, with their selected week's tracked time split into
 * "Abrechenbar" (billable, role `hourly_rate > 0`) / "Nicht abrechenbar"
 * (non-billable, rate `0`) / "Gesamt" (total) columns. The "Ohne Rolle" column
 * (role-less time entries) only renders when at least one visible row has any —
 * most weeks won't. Rows expand (click the chevron) to a drill-down panel with
 * the per-role breakdown behind the two summary numbers — see `lib/auswertung.ts`
 * for how these are rolled up and classified.
 *
 * Follows the `ColumnDef`-driven convention used by `AbrechnungTable.tsx`
 * (itself following `components/shared/time-entries/TimeEntryTable.tsx`),
 * extended with the same local expand/collapse row state.
 */
export function AuswertungTable({ items, loading, error }: AuswertungTableProps) {
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

	const toggleExpand = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const showUnassignedColumn = useMemo(() => items.some((row) => row.unassignedSeconds > 0), [items]);

	const totals = useMemo(
		() =>
			items.reduce(
				(acc, row) => ({
					billable: acc.billable + row.billableSeconds,
					nonBillable: acc.nonBillable + row.nonBillableSeconds,
					unassigned: acc.unassigned + row.unassignedSeconds,
					total: acc.total + row.totalSeconds,
				}),
				{ billable: 0, nonBillable: 0, unassigned: 0, total: 0 },
			),
		[items],
	);

	const columns: ColumnDef<AuswertungUserRow>[] = useMemo(
		() => [
			{
				id: "name",
				header: "Mitarbeiter",
				minWidth: 260,
				cell: ({ row }) => (
					<Group gap="xs" wrap="nowrap">
						<ActionIcon variant="subtle" size="sm" onClick={() => toggleExpand(row.userId)} aria-label={expandedIds.has(row.userId) ? "Details ausblenden" : "Details anzeigen"}>
							<Icon name={expandedIds.has(row.userId) ? "expand_more" : "chevron_right"} size={18} />
						</ActionIcon>
						<Avatar src={row.photoUrl} alt={row.name} radius="xl" size="sm">
							{row.name.charAt(0)}
						</Avatar>
						<Text fw={500} size="sm" title={row.name}>
							{row.name}
						</Text>
					</Group>
				),
			},
			{
				id: "billable",
				header: "Abrechenbar",
				align: "right",
				minWidth: 130,
				cell: ({ row }) => <DurationCell seconds={row.billableSeconds} />,
			},
			{
				id: "nonBillable",
				header: "Nicht abrechenbar",
				align: "right",
				minWidth: 150,
				cell: ({ row }) => <DurationCell seconds={row.nonBillableSeconds} />,
			},
			{
				id: "unassigned",
				header: "Ohne Rolle",
				align: "right",
				minWidth: 110,
				hidden: !showUnassignedColumn,
				cell: ({ row }) => <DurationCell seconds={row.unassignedSeconds} />,
			},
			{
				id: "total",
				header: "Gesamt",
				align: "right",
				minWidth: 110,
				cell: ({ row }) => <DurationCell seconds={row.totalSeconds} fw={600} />,
			},
		],
		[expandedIds, showUnassignedColumn],
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
				<Text c="dimmed">Keine Mitarbeiter gefunden.</Text>
			</Center>
		);
	}

	return (
		<Table.ScrollContainer minWidth={calculatedMinWidth} maxHeight={750} style={{ flex: 1, width: "100%" }} scrollAreaProps={{ type: "auto", offsetScrollbars: "present" }}>
			<Table stickyHeader highlightOnHover withTableBorder withColumnBorders withRowBorders verticalSpacing="sm" layout="auto" style={{ width: "100%" }} className={styles.table}>
				<Table.Thead className={styles.headerRow}>
					<Table.Tr>
						{visibleColumns.map((col) => (
							<Table.Th key={col.id} fw={600} style={{ minWidth: col.minWidth }} ta={col.align || "left"} className={styles.headerCell}>
								{typeof col.header === "function" ? col.header({ data: items }) : col.header}
							</Table.Th>
						))}
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>
					{items.map((item, rowIndex) => (
						<Fragment key={item.userId}>
							<Table.Tr className={expandedIds.has(item.userId) ? styles.expandedRow : styles.bodyRow}>
								{visibleColumns.map((col) => (
									<Table.Td key={col.id} ta={col.align || "left"} style={{ minWidth: col.minWidth }}>
										{col.cell({ row: item, index: rowIndex })}
									</Table.Td>
								))}
							</Table.Tr>
							{expandedIds.has(item.userId) && (
								<Table.Tr>
									<Table.Td colSpan={visibleColumns.length} style={{ background: "var(--color--background-secondary)" }}>
										<AuswertungUserDetails user={item} />
									</Table.Td>
								</Table.Tr>
							)}
						</Fragment>
					))}
				</Table.Tbody>
				<Table.Tfoot>
					<Table.Tr className={styles.headerRow}>
						<Table.Th className={styles.headerCell}>Gesamt</Table.Th>
						<Table.Th className={styles.headerCell} ta="right">
							<DurationCell seconds={totals.billable} fw={600} />
						</Table.Th>
						<Table.Th className={styles.headerCell} ta="right">
							<DurationCell seconds={totals.nonBillable} fw={600} />
						</Table.Th>
						{showUnassignedColumn && (
							<Table.Th className={styles.headerCell} ta="right">
								<DurationCell seconds={totals.unassigned} fw={600} />
							</Table.Th>
						)}
						<Table.Th className={styles.headerCell} ta="right">
							<DurationCell seconds={totals.total} fw={600} />
						</Table.Th>
					</Table.Tr>
				</Table.Tfoot>
			</Table>
		</Table.ScrollContainer>
	);
}

/** Card grid showing time per role, grouped into one bucket (billable or non-billable/role-less). */
function RoleBreakdownCards({ roles }: { roles: AuswertungRoleBreakdown[] }) {
	return (
		<SimpleGrid type="container" cols={{ base: 1, "500px": 2, "620px": 3, "800px": 4 }} spacing={8}>
			{roles.map((role) => (
				<Card key={role.roleId ?? "unassigned"} withBorder padding="sm" radius="sm" style={{ flex: 1, minWidth: "150px", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: "8px", borderColor: "var(--color--border-layout)", backgroundColor: "var(--color--background-primary)" }}>
					<Text size="xs" c="var(--color--text-secondary)" fw={600} lh={1}>
						{role.roleName}
					</Text>
					<Text c="var(--color--text-primary)" fw={600} size="xs" lh={1}>
						{formatDuration(role.totalSeconds)}
					</Text>
				</Card>
			))}
		</SimpleGrid>
	);
}

/** Drill-down panel shown under an expanded user row: per-role breakdown, grouped into the same billable / non-billable / role-less buckets as the summary columns. */
function AuswertungUserDetails({ user }: { user: AuswertungUserRow }) {
	const billableRoles = user.byRole.filter((r) => r.rateClass === "billable");
	const nonBillableRoles = user.byRole.filter((r) => r.rateClass === "nonBillable");
	const unassignedRoles = user.byRole.filter((r) => r.rateClass === "unassigned");

	if (user.byRole.length === 0) {
		return (
			<Text size="sm" c="dimmed" py="xs">
				Keine Zeiteinträge in dieser Woche.
			</Text>
		);
	}

	return (
		<Stack gap="md" pb="md">
			{billableRoles.length > 0 && (
				<Box>
					<Text size="sm" fw={600} mb={8}>
						Abrechenbar
					</Text>
					<RoleBreakdownCards roles={billableRoles} />
				</Box>
			)}
			{nonBillableRoles.length > 0 && (
				<Box>
					<Text size="sm" fw={600} mb={8}>
						Nicht abrechenbar
					</Text>
					<RoleBreakdownCards roles={nonBillableRoles} />
				</Box>
			)}
			{unassignedRoles.length > 0 && (
				<Box>
					<Text size="sm" fw={600} mb={8}>
						Ohne Rolle
					</Text>
					<RoleBreakdownCards roles={unassignedRoles} />
				</Box>
			)}
		</Stack>
	);
}
