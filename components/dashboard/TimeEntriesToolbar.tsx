// components/dashboard/TimeEntriesToolbar.tsx
"use client";

import { useEffect, useState } from "react";
import { Flex } from "@mantine/core";
import { type DatesRangeValue } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import { DatePicker, Input, Select, Button, Icon } from "@/components";
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

	const hasActiveFilters = !!(filters.roleId || filters.boardId || filters.startDate || filters.endDate);

	const dateRangeValue: DatesRangeValue = [filters.startDate, filters.endDate];

	const handleReset = () => {
		setSearchInput("");
		resetFilters();
	};

	return (
		<Flex gap="sm" wrap="wrap" align="flex-end" px="md" py="sm">
			<Input placeholder="Aufgabe oder Kommentar suchen…" value={searchInput} onChange={(event) => setSearchInput(event.currentTarget.value)} leftSection={<Icon name="search" size={16} color="var(--color--text-placeholder)" />} leftSectionPointerEvents="none" style={{ flex: "0 1 min(350px, 100%)", minWidth: 180 }} clearable onClear={() => setSearchInput("")} clearButtonLabel="Suche löschen" />
			<Select placeholder="Rolle" data={filterOptions.roles.map((r) => ({ value: r.id, label: r.name }))} value={filters.roleId} onChange={(value) => setFilter({ roleId: value })} clearable style={{ width: 200, flexShrink: 0 }} />
			<Select placeholder="Board" data={filterOptions.boards.map((b) => ({ value: b.id, label: b.name }))} value={filters.boardId} onChange={(value) => setFilter({ boardId: value })} clearable style={{ width: 160, flexShrink: 0 }} />
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
				style={{ width: "clamp(180px, 100%, 250px)", flexShrink: 0 }}
				highlightToday
				withWeekNumbers
			/>
			{hasActiveFilters && (
				<Button variant="default" onClick={handleReset}>
					Filter zurücksetzen
				</Button>
			)}
		</Flex>
	);
}
