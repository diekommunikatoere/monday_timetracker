// components/dashboard/analytics/AuswertungToolbar.tsx
"use client";

import { Popover, Text } from "@mantine/core";
import { DatePicker as MantineCalendar } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import { Input, Icon, IconButton } from "@/components";
import { DatePickerProps } from "@/components/ui/forms/types";
import { getISOWeek, startOfISOWeek } from "@/lib/time/calculations";
import { useAuswertungStore } from "@/stores/auswertungStore";

import classes from "@/components/styles/features/auswertung/AuswertungToolbar.module.css";

/** `"KW 31 · 27.07. – 02.08.2026"` — the selected ISO week, German-formatted. */
function formatWeekLabel(weekStart: Date): string {
	const { week } = getISOWeek(weekStart);
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekEnd.getDate() + 6);

	const startStr = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(weekStart);
	const endStr = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(weekEnd);

	return `KW ${week} · ${startStr} – ${endStr}`;
}

/**
 * Toolbar for the Auswertung view — search + ISO-week navigation (◀ / ▶
 * stepper, a date picker to jump to the week containing any date, and a
 * "Diese Woche" reset). Structurally a trimmed-down `AbrechnungToolbar.tsx`:
 * there's only one client-side filter (search), and the week nav replaces
 * Abrechnung's collapsible filter row since it's always relevant, not
 * optional.
 */
export default function AuswertungToolbar() {
	const { filters, setFilter } = useAuswertungStore();
	const weekStart = useAuswertungStore((state) => state.weekStart);
	const stepWeek = useAuswertungStore((state) => state.stepWeek);
	const goToWeekOf = useAuswertungStore((state) => state.goToWeekOf);
	const goToCurrentWeek = useAuswertungStore((state) => state.goToCurrentWeek);

	// Local, un-debounced input state so the text box feels responsive; the store's
	// `filters.search` (and therefore the Fuse search in `useFilteredAuswertung`)
	// only updates ~200ms after typing stops — same pattern as `AbrechnungToolbar`.
	const [searchInput, setSearchInput] = useState(filters.search);
	const [debouncedSearch] = useDebouncedValue(searchInput, 200);
	const [datePickerOpened, setDatePickerOpened] = useState(false);

	useEffect(() => {
		setFilter({ search: debouncedSearch });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedSearch]);

	const isCurrentWeek = !!weekStart && weekStart.getTime() === startOfISOWeek(new Date()).getTime();

	const getDayProps: DatePickerProps<"range">["getDayProps"] = (date) => {
		const d = dayjs(date);
		const isToday = d.isSame(dayjs(), "day");

		if (isToday) {
			return {
				style: {
					borderColor: "var(--color--border-ui)",
				},
			};
		}

		return {};
	};

	return (
		<div className={classes.container}>
			<div className={classes.toolbar}>
				<div className={classes.searchGroup}>
					<Input
						placeholder="Mitarbeiter suchen…"
						value={searchInput}
						onChange={(event) => setSearchInput(event.currentTarget.value)}
						leftSection={<Icon name="search" size={16} color="var(--color--text-placeholder)" />}
						leftSectionPointerEvents="none"
						clearable
						onClear={() => setSearchInput("")}
						clearButtonLabel="Suche löschen"
					/>
				</div>
				<div className={classes.weekNav}>
					<IconButton size="lg" colorVariant="tertiary" onClick={() => stepWeek(-1)} aria-label="Vorherige Woche">
						<Icon name="chevron_left" />
					</IconButton>
					<Text fw={600} size="sm" className={classes.weekLabel}>
						{weekStart ? formatWeekLabel(weekStart) : ""}
					</Text>
					<IconButton size="lg" colorVariant="tertiary" onClick={() => stepWeek(1)} aria-label="Nächste Woche">
						<Icon name="chevron_right" />
					</IconButton>
					<Popover opened={datePickerOpened} onChange={setDatePickerOpened} position="bottom" withArrow shadow="md">
						<Popover.Target>
							<IconButton size="lg" colorVariant="tertiary" onClick={() => setDatePickerOpened((opened) => !opened)} aria-label="Datum wählen">
								<Icon name="date_range" size={21} />
							</IconButton>
						</Popover.Target>
						<Popover.Dropdown styles={{ dropdown: { backgroundColor: "var(--color--background-secondary)" } }}>
							<MantineCalendar
								value={null}
								onChange={(value) => {
									if (value) goToWeekOf(new Date(value));
									setDatePickerOpened(false);
								}}
								highlightToday
								withWeekNumbers
								getDayProps={getDayProps}
							/>
						</Popover.Dropdown>
					</Popover>
					<IconButton size="lg" colorVariant="primary" onClick={goToCurrentWeek} disabled={isCurrentWeek}>
						<Icon name="today" size={21} />
					</IconButton>
				</div>
			</div>
		</div>
	);
}
