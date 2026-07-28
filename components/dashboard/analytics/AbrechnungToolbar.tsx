// components/dashboard/analytics/AbrechnungToolbar.tsx
"use client";

import { Tooltip, Collapse, NumberInput } from "@mantine/core";
import { type DatesRangeValue } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import { useEffect, useState } from "react";

import { DatePicker, Input, Select, Button, Icon, IconButton } from "@/components";
import classes from "@/components/styles/features/abrechnung/AbrechnungToolbar.module.css";
import { useAbrechnungStore } from "@/stores/abrechnungStore";

import type { AbrechnungBoardOption } from "./hooks/useFilteredAbrechnung";

/**
 * Props for {@link AbrechnungToolbar}.
 *
 * @property boardOptions - Budget boards present in `activeBoards` (from
 *   `useFilteredAbrechnung`), so the Budget-Board dropdown lists no dead values. Passed in
 *   rather than recomputed here so the filter pass only runs once per render, in the parent —
 *   same reasoning as `TimeEntriesToolbar`'s `filterOptions` prop.
 */
interface AbrechnungToolbarProps {
	boardOptions: AbrechnungBoardOption[];
}

/**
 * Toolbar for the Abrechnung active view — search + Budget-Board + Zeitraum + Auslastung
 * filters. Structurally a copy of `components/dashboard/TimeEntriesToolbar.tsx`, adapted to
 * `useAbrechnungStore`'s `filters`: see that store's `AbrechnungFilters` doc for which
 * fields refetch (the date range, server-side) vs. filter client-side (search, board,
 * utilization).
 *
 * Only affects the active (current-year) table — the Archiv section below it is
 * intentionally never filtered, so this toolbar renders above the active section only.
 */
export default function AbrechnungToolbar({ boardOptions }: AbrechnungToolbarProps) {
	const { filters, setFilter, resetFilters } = useAbrechnungStore();
	const [showFilters, setShowFilters] = useState(false);

	// Local, un-debounced input state so the text box feels responsive; the store's
	// `filters.search` (and therefore the Fuse search in `useFilteredAbrechnung`) only
	// updates ~200ms after typing stops.
	const [searchInput, setSearchInput] = useState(filters.search);
	const [debouncedSearch] = useDebouncedValue(searchInput, 200);

	useEffect(() => {
		setFilter({ search: debouncedSearch });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedSearch]);

	// The date range triggers a server refetch (see the store), so it gets its own,
	// longer debounce to avoid firing a request per calendar click while picking a range.
	const [dateRangeInput, setDateRangeInput] = useState<DatesRangeValue>([filters.startDate, filters.endDate]);
	const [debouncedDateRange] = useDebouncedValue(dateRangeInput, 400);

	useEffect(() => {
		const [start, end] = debouncedDateRange;
		setFilter({ startDate: start ? new Date(start) : null, endDate: end ? new Date(end) : null });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedDateRange]);

	const hasActiveFilters = !!(filters.search || filters.boardId || filters.startDate || filters.endDate || filters.utilizationMin !== null || filters.utilizationMax !== null);

	const handleReset = () => {
		setSearchInput("");
		setDateRangeInput([null, null]);
		resetFilters();
	};

	const handleToggleFilters = () => {
		setShowFilters((prev) => !prev);
	};

	return (
		<div className={classes.container}>
			<div className={classes.toolbar}>
				<div className={classes.searchGroup}>
					<Input placeholder="Budget-Item oder Projekt suchen…" value={searchInput} onChange={(event) => setSearchInput(event.currentTarget.value)} leftSection={<Icon name="search" size={16} color="var(--color--text-placeholder)" />} leftSectionPointerEvents="none" clearable onClear={() => setSearchInput("")} clearButtonLabel="Suche löschen" />
					<Tooltip label={showFilters ? "Filter ausblenden" : "Filter einblenden"} position="top" withArrow>
						<IconButton size="lg" colorVariant={showFilters ? undefined : "tertiary"} onClick={handleToggleFilters} aria-label={showFilters ? "Filter ausblenden" : "Filter einblenden"}>
							<Icon name={showFilters ? "filter_alt_off" : "filter_alt"} />
						</IconButton>
					</Tooltip>
					{hasActiveFilters && (
						<Button variant="default" onClick={handleReset} className={classes.resetButton}>
							Filter zurücksetzen
						</Button>
					)}
				</div>
				<Collapse expanded={showFilters} className={classes.filtersCollapse} transitionDuration={200} keepMounted>
					<div className={classes.filtersRow}>
						<Select placeholder="Budget-Board" data={boardOptions.map((b) => ({ value: b.id, label: b.name }))} value={filters.boardId} onChange={(value) => setFilter({ boardId: value })} clearable />
						<DatePicker type="range" allowSingleDateInRange placeholder="Zeitraum wählen" value={dateRangeInput} onChange={setDateRangeInput} valueFormat="DD.MM.YYYY" clearable leftSection={<Icon name="date_range" size={18} color="var(--color--text-placeholder)" />} leftSectionPointerEvents="none" highlightToday withWeekNumbers />
						<NumberInput placeholder="Auslastung in % von" suffix=" %" min={0} allowNegative={false} clampBehavior="none" value={filters.utilizationMin ?? ""} onChange={(value) => setFilter({ utilizationMin: value === "" ? null : Number(value) })} />
						<NumberInput placeholder="Auslastung in % bis" suffix=" %" min={0} allowNegative={false} clampBehavior="none" value={filters.utilizationMax ?? ""} onChange={(value) => setFilter({ utilizationMax: value === "" ? null : Number(value) })} />
					</div>
				</Collapse>
			</div>
		</div>
	);
}
