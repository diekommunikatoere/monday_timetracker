"use client";

import { Accordion, Select, Stack, Text } from "@mantine/core";
import { useEffect, useMemo } from "react";

import { ErrorState, LoadingState } from "@/components";
import { AbrechnungTable } from "@/components/dashboard/analytics/AbrechnungTable";
import AbrechnungToolbar from "@/components/dashboard/analytics/AbrechnungToolbar";
import { useFilteredAbrechnung } from "@/components/dashboard/analytics/hooks/useFilteredAbrechnung";
import { useAbrechnungStore } from "@/stores/abrechnungStore";
import { useMondayStore } from "@/stores/mondayStore";

import type { AbrechnungBoard, AbrechnungLinkedItem } from "@/types/abrechnung";

/**
 * Abrechnung (budget rollup) view — a single flat table across every active budget
 * board (e.g. "Retainer", "Wartung"), each row a budget item rolled up with tracked
 * time / cost / remaining budget across its linked job items (see `lib/abrechnung.ts`),
 * with a "Budget-Board" column identifying which board each row came from. Filterable
 * via `AbrechnungToolbar` (search, Budget-Board, Zeitraum, Auslastung). Read-only report.
 *
 * The Archiv section at the bottom is intentionally separate: it keeps its own
 * accordion + year picker + one-table-per-board layout, and is never touched by the
 * toolbar's filters. It fetches nothing until expanded (the period list), and fetches
 * a specific period's data only once a year is picked — see `stores/abrechnungStore.ts`
 * for why this is split into three independent fetches instead of one eager load.
 *
 * Access is gated to admins via `lib/permissions/routes.ts` (financial data);
 * `DashboardMenuButton` already hides the nav link for non-admins accordingly.
 */
/** Alphabetically sorts boards, each board's items, and each item's linkedItems, without mutating any input. */
function sortBoardsByName(boards: AbrechnungBoard[]): AbrechnungBoard[] {
	const sortByName = <T extends { name: string }>(list: T[]): T[] => [...list].sort((a, b) => a.name.localeCompare(b.name));
	const sortLinkedItems = (linkedItems: AbrechnungLinkedItem[]): AbrechnungLinkedItem[] => sortByName(linkedItems);

	return [...boards].sort((a, b) => a.boardName.localeCompare(b.boardName)).map((board) => ({ ...board, items: sortByName(board.items).map((item) => ({ ...item, linkedItems: sortLinkedItems(item.linkedItems) })) }));
}

/** `DD.MM.YYYY`, matching the toolbar's `DatePicker` `valueFormat`. */
function formatDateDe(date: Date): string {
	return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export default function AbrechnungPage() {
	const sessionToken = useMondayStore((state) => state.sessionToken);

	const activeBoards = useAbrechnungStore((state) => state.activeBoards);
	const activeLoading = useAbrechnungStore((state) => state.activeLoading);
	const activeError = useAbrechnungStore((state) => state.activeError);
	const fetchActiveBudgetData = useAbrechnungStore((state) => state.fetchActiveBudgetData);
	const startDate = useAbrechnungStore((state) => state.filters.startDate);
	const endDate = useAbrechnungStore((state) => state.filters.endDate);

	const archivePeriods = useAbrechnungStore((state) => state.archivePeriods);
	const archivePeriodsLoading = useAbrechnungStore((state) => state.archivePeriodsLoading);
	const archivePeriodsError = useAbrechnungStore((state) => state.archivePeriodsError);
	const fetchArchivePeriods = useAbrechnungStore((state) => state.fetchArchivePeriods);

	const selectedArchiveBoardId = useAbrechnungStore((state) => state.selectedArchiveBoardId);
	const selectedArchiveBoards = useAbrechnungStore((state) => state.selectedArchiveBoards);
	const selectedArchiveLoading = useAbrechnungStore((state) => state.selectedArchiveLoading);
	const selectedArchiveError = useAbrechnungStore((state) => state.selectedArchiveError);
	const selectArchivePeriod = useAbrechnungStore((state) => state.selectArchivePeriod);

	const { rows, boardOptions, hasActiveFilters } = useFilteredAbrechnung();

	// Fetch the active view once the monday session is ready — mirrors the
	// no-auto-fetch convention in stores/CLAUDE.md.
	useEffect(() => {
		if (sessionToken) {
			fetchActiveBudgetData();
		}
	}, [sessionToken, fetchActiveBudgetData]);

	// The archive section is intentionally never touched by the toolbar's filters —
	// sort only, non-mutating (see `useFilteredAbrechnung` for why this can't be a
	// plain `.sort()` on the store's own arrays).
	const sortedSelectedArchiveBoards = useMemo(() => sortBoardsByName(selectedArchiveBoards), [selectedArchiveBoards]);

	// Only fetch the (cheap) archive period list the first time the section opens.
	const handleArchiveAccordionChange = (value: string | null) => {
		if (value === "archiv") {
			fetchArchivePeriods();
		}
	};

	const archiveSelectData = archivePeriods
		.map((period) => ({
			value: period.boardId,
			label: period.label ? `${period.label} — ${period.boardName}` : period.boardName,
		}))
		.sort((a, b) => a.label.localeCompare(b.label));

	return (
		<div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
			<AbrechnungToolbar boardOptions={boardOptions} />
			<div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 32 }}>
				{activeError && <ErrorState message={activeError} />}

				{activeLoading && activeBoards.length === 0 ? (
					<LoadingState />
				) : activeBoards.length === 0 && !activeError ? (
					<Text c="dimmed">Keine Budget-Boards konfiguriert. Ein Administrator kann sie unter Admin → Budget-Boards einrichten.</Text>
				) : hasActiveFilters && rows.length === 0 ? (
					<Text c="dimmed">Keine Budget-Items für diese Filter gefunden.</Text>
				) : (
					<Stack gap="xs">
						{startDate && endDate && (
							<Text size="sm" c="dimmed">
								Zahlen für {formatDateDe(startDate)} – {formatDateDe(endDate)}
							</Text>
						)}
						<AbrechnungTable items={rows} showBoardColumn loading={activeLoading} error={null} />
					</Stack>
				)}

				<Accordion variant="separated" chevronPosition="right" onChange={handleArchiveAccordionChange}>
					<Accordion.Item value="archiv">
						<Accordion.Control>Archiv</Accordion.Control>
						<Accordion.Panel>
							{archivePeriodsError && <ErrorState message={archivePeriodsError} />}

							{archivePeriodsLoading ? (
								<LoadingState />
							) : archivePeriods.length === 0 ? (
								<Text c="dimmed" size="sm">
									Keine archivierten Zeiträume.
								</Text>
							) : (
								<Stack gap="md">
									<Select placeholder="Zeitraum auswählen" data={archiveSelectData} value={selectedArchiveBoardId} onChange={(value) => value && selectArchivePeriod(value)} />

									{selectedArchiveBoardId && selectedArchiveError && <ErrorState message={selectedArchiveError} />}

									{selectedArchiveBoardId && selectedArchiveLoading && <LoadingState />}

									{selectedArchiveBoardId &&
										!selectedArchiveLoading &&
										sortedSelectedArchiveBoards.map((board) => (
											<Stack key={board.boardId} gap="xs">
												<Text fw={600}>{board.boardName}</Text>
												<AbrechnungTable items={board.items.map((item) => ({ ...item, boardId: board.boardId, boardName: board.boardName }))} loading={false} error={null} />
											</Stack>
										))}
								</Stack>
							)}
						</Accordion.Panel>
					</Accordion.Item>
				</Accordion>
			</div>
		</div>
	);
}
