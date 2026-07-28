"use client";

import { Accordion, Loader, Select, Stack, Text } from "@mantine/core";
import { useEffect } from "react";

import { ErrorState, LoadingState } from "@/components";
import { AbrechnungTable } from "@/components/dashboard/analytics/AbrechnungTable";
import { useAbrechnungStore } from "@/stores/abrechnungStore";
import { useMondayStore } from "@/stores/mondayStore";

/**
 * Abrechnung (budget rollup) view — one table per budget board (e.g. "Retainer"),
 * each row a budget item rolled up with tracked time / cost / remaining budget
 * across its linked job items (see `lib/abrechnung.ts`). Read-only report.
 *
 * The Archiv section at the bottom fetches nothing until expanded (the period
 * list), and fetches a specific period's data only once a year is picked —
 * see `stores/abrechnungStore.ts` for why this is split into three independent
 * fetches instead of one eager load.
 *
 * Access is gated to admins via `lib/permissions/routes.ts` (financial data);
 * `DashboardMenuButton` already hides the nav link for non-admins accordingly.
 */
export default function AbrechnungPage() {
	const sessionToken = useMondayStore((state) => state.sessionToken);

	const activeBoards = useAbrechnungStore((state) => state.activeBoards);
	const activeLoading = useAbrechnungStore((state) => state.activeLoading);
	const activeError = useAbrechnungStore((state) => state.activeError);
	const fetchActiveBudgetData = useAbrechnungStore((state) => state.fetchActiveBudgetData);

	const archivePeriods = useAbrechnungStore((state) => state.archivePeriods);
	const archivePeriodsLoading = useAbrechnungStore((state) => state.archivePeriodsLoading);
	const archivePeriodsError = useAbrechnungStore((state) => state.archivePeriodsError);
	const fetchArchivePeriods = useAbrechnungStore((state) => state.fetchArchivePeriods);

	const selectedArchiveBoardId = useAbrechnungStore((state) => state.selectedArchiveBoardId);
	const selectedArchiveBoards = useAbrechnungStore((state) => state.selectedArchiveBoards);
	const selectedArchiveLoading = useAbrechnungStore((state) => state.selectedArchiveLoading);
	const selectedArchiveError = useAbrechnungStore((state) => state.selectedArchiveError);
	const selectArchivePeriod = useAbrechnungStore((state) => state.selectArchivePeriod);

	// Fetch the active view once the monday session is ready — mirrors the
	// no-auto-fetch convention in stores/CLAUDE.md.
	useEffect(() => {
		if (sessionToken) {
			fetchActiveBudgetData();
		}
	}, [sessionToken, fetchActiveBudgetData]);

	// Sort budget boards by name (ascending) for display; the store doesn't sort them.
	const sortedActiveBoards = [...activeBoards].sort((a, b) => a.boardName.localeCompare(b.boardName));
	const sortedSelectedArchiveBoards = [...selectedArchiveBoards].sort((a, b) => a.boardName.localeCompare(b.boardName));

	// Sort project items inside boards by name (ascending) for display; the store doesn't sort them.
	sortedActiveBoards.forEach((board) => {
		board.items.sort((a, b) => a.name.localeCompare(b.name));
	});
	sortedSelectedArchiveBoards.forEach((board) => {
		board.items.sort((a, b) => a.name.localeCompare(b.name));
	});

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

	console.log("AbrechnungPage render:", {
		sortedSelectedArchiveBoards,
		archiveSelectData,
		sortedActiveBoards,
	});

	return (
		<div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 32 }}>
			{activeError && <ErrorState message={activeError} />}

			{activeLoading && activeBoards.length === 0 ? (
				<LoadingState />
			) : activeBoards.length === 0 && !activeError ? (
				<Text c="dimmed">Keine Budget-Boards konfiguriert. Ein Administrator kann sie unter Admin → Budget-Boards einrichten.</Text>
			) : (
				<Accordion variant="contained" chevronPosition="right" styles={{ content: { padding: 0 } }}>
					{sortedActiveBoards.map((board) => (
						<Accordion.Item value={board.boardId} key={board.boardId}>
							<Accordion.Control fw={700}>{board.boardName}</Accordion.Control>
							<Accordion.Panel>
								<AbrechnungTable items={board.items} loading={activeLoading} error={null} />
							</Accordion.Panel>
						</Accordion.Item>
					))}
				</Accordion>
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
											<AbrechnungTable items={board.items} loading={false} error={null} />
										</Stack>
									))}
							</Stack>
						)}
					</Accordion.Panel>
				</Accordion.Item>
			</Accordion>
		</div>
	);
}
