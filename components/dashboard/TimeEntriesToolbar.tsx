// components/dashboard/TimeEntriesToolbar.tsx
"use client";

import { useEffect, useState } from "react";
import { Flex, Tooltip, Collapse } from "@mantine/core";
import { type DatesRangeValue } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import { DatePicker, Input, Select, Button, Icon, IconButton } from "@/components";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import type { TimeEntriesFilterOption } from "./hooks/useFilteredTimeEntries";

/**
 * Props for {@link TimeEntriesToolbar}.
 *
 * @property filterOptions - Roles/boards actually present in the user's entries
 *   (from `useFilteredTimeEntries`), so the dropdowns list no dead values. Passed
 *   in rather than recomputed here so the Fuse index + filter pass only run once
 *   per render, in the parent `TimeEntriesTable`.
 */
interface TimeEntriesToolbarProps {
	filterOptions: {
		roles: TimeEntriesFilterOption[];
		boards: TimeEntriesFilterOption[];
		timerState: TimeEntriesFilterOption[];
	};
}

/**
 * Dashboard filter bar: free-text search (tokenized-fuzzy, see
 * `useFilteredTimeEntries`), role/board dropdowns, and a date range — all
 * writing into `useTimeEntriesStore`'s `filters`. Filtering itself is
 * client-side and instant; the only debounce here is on the search box, to
 * avoid re-running the Fuse search on every keystroke over a potentially large
 * entry list.
 *
 * @param props - {@link TimeEntriesToolbarProps}.
 */
export default function TimeEntriesToolbar({ filterOptions }: TimeEntriesToolbarProps) {
	const { filters, setFilter, resetFilters } = useTimeEntriesStore();
	const [showFilters, setShowFilters] = useState(false);

	// Local, un-debounced input state so the text box feels responsive; the
	// store's `filters.search` (and therefore the Fuse search) only updates
	// ~200ms after typing stops.
	const [searchInput, setSearchInput] = useState(filters.search);
	const [debouncedSearch] = useDebouncedValue(searchInput, 200);

	useEffect(() => {
		setFilter({ search: debouncedSearch });
		// Only re-run when the debounced value changes — `setFilter` is stable
		// (Zustand action), including it would be a no-op dependency.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedSearch]);

	const hasActiveFilters = !!(filters.roleId || filters.boardId || filters.timerState || filters.startDate || filters.endDate);

	const dateRangeValue: DatesRangeValue = [filters.startDate, filters.endDate];

	const handleReset = () => {
		setSearchInput("");
		resetFilters();
	};

	const handleToggleFilters = () => {
		setShowFilters((prev) => !prev);
	};

	// Sort roles and boards by name for the dropdowns, so the order is stable and
	// predictable (and not dependent on the order of the user's entries).
	filterOptions.roles.sort((a, b) => a.name.localeCompare(b.name));
	filterOptions.boards.sort((a, b) => a.name.localeCompare(b.name));

	return (
		<Flex direction={{ base: "column", md: "row" }} gap={{ base: 0, md: "sm" }} align={{ base: "flex-start", md: "center" }} px="md" py="sm">
			<Flex gap="sm" align="center" w={{ base: "100%", sm: "min(400px, 100%)" }}>
				<Input placeholder="Aufgabe oder Kommentar suchen…" value={searchInput} onChange={(event) => setSearchInput(event.currentTarget.value)} leftSection={<Icon name="search" size={16} color="var(--color--text-placeholder)" />} leftSectionPointerEvents="none" flex={{ base: "1 1 100%", sm: "1 1 400px" }} clearable onClear={() => setSearchInput("")} clearButtonLabel="Suche löschen" />
				<Tooltip label={showFilters ? "Filter ausblenden" : "Filter einblenden"} position="top" withArrow>
					<IconButton size="lg" colorVariant={showFilters ? undefined : "tertiary"} onClick={handleToggleFilters} aria-label={showFilters ? "Filter ausblenden" : "Filter einblenden"}>
						<Icon name={showFilters ? "filterOff" : "filter"} size={24} color={showFilters ? "var(--color--icon-on-primary)" : "var(--color--icon-on-tertiary)"} />
					</IconButton>
				</Tooltip>
				{hasActiveFilters && (
					<Button variant="default" onClick={handleReset}>
						Filter zurücksetzen
					</Button>
				)}
			</Flex>
			<Collapse expanded={showFilters} style={{ width: "100%" }} transitionDuration={200} keepMounted>
				<Flex gap="sm" wrap="wrap" align="flex-start" pt={{ base: "sm", md: 0 }} style={{ width: "100%" }}>
					<Select placeholder="Rolle" data={filterOptions.roles.map((r) => ({ value: r.id, label: r.name }))} value={filters.roleId} onChange={(value) => setFilter({ roleId: value })} clearable flex={{ base: "1 1 100%", sm: "1 2 250px" }} maw={{ base: "100%", sm: 200 }} />
					<Select placeholder="Board" data={filterOptions.boards.map((b) => ({ value: b.id, label: b.name }))} value={filters.boardId} onChange={(value) => setFilter({ boardId: value })} clearable flex={{ base: "1 1 100%", sm: "1 2 250px" }} maw={{ base: "100%", sm: 200 }} />
					<Select placeholder="Status" data={filterOptions.timerState.map((t) => ({ value: t.id, label: t.name }))} value={filters.timerState} onChange={(value) => setFilter({ timerState: value })} clearable flex={{ base: "1 1 100%", sm: "1 2 250px" }} maw={{ base: "100%", sm: 200 }} />
					<DatePicker
						type="range"
						allowSingleDateInRange
						placeholder="Zeitraum wählen"
						value={dateRangeValue}
						onChange={(value) => {
							const [start, end] = value;
							// This Mantine version reports range values as ISO date strings
							// (not `Date`); normalize to `Date` here so the rest of the app
							// (filters, useFilteredTimeEntries) only ever deals with `Date`.
							setFilter({ startDate: start ? new Date(start) : null, endDate: end ? new Date(end) : null });
						}}
						valueFormat="DD.MM.YYYY"
						clearable
						leftSection={<Icon name="calendar" size={16} color="var(--color--text-placeholder)" />}
						leftSectionPointerEvents="none"
						flex={{ base: "1 1 100%", sm: "1 2 250px" }}
						maw={{ base: "100%", sm: 200 }}
						highlightToday
						withWeekNumbers
					/>
				</Flex>
			</Collapse>
		</Flex>
	);
}
