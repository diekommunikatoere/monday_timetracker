// components/dashboard/calendar/calendar-utils.ts
// Pure helpers bridging TimeEntry (app domain) and @mantine/schedule's event model.

import dayjs from "dayjs";

import { ScheduleEventData } from "@mantine/schedule";

import { TimeEntry } from "@/types/time-entry";

/** Payload carried by every calendar event, so handlers can get back to the source entry. */
export type CalendarEventPayload = { entry: TimeEntry };

/**
 * Maps a `finalized`/`parked` {@link TimeEntry} to a `@mantine/schedule` event.
 *
 * `start`/`end` are formatted as local wall-clock `"YYYY-MM-DD HH:mm:ss"` strings
 * (the format `@mantine/schedule` expects), not UTC ISO. Finalized entries render
 * filled in the primary brand color; parked (draft) entries render light in the
 * tertiary color, matching the table's draft-row treatment.
 *
 * @param entry - A `finalized` or `parked` time entry with both timestamps set.
 * @returns A `ScheduleEventData` ready to pass to `Schedule`'s `events` prop.
 */
export function entryToScheduleEvent(entry: TimeEntry): ScheduleEventData<CalendarEventPayload> {
	const isFinalized = entry.timer_state === "finalized";

	return {
		id: entry.id,
		title: entry.item_name || entry.task_name || "Unzugeordneter Zeiteintrag",
		start: dayjs(entry.start_time).format("YYYY-MM-DD HH:mm:ss"),
		end: dayjs(entry.end_time).format("YYYY-MM-DD HH:mm:ss"),
		color: isFinalized ? "dki-primary" : "dki-tertiary",
		variant: isFinalized ? "filled" : "light",
		payload: { entry },
	};
}

/**
 * Recovers the source {@link TimeEntry} from a calendar event's payload.
 *
 * Safe for any event produced by {@link entryToScheduleEvent} — every calendar
 * event carries `payload.entry` by construction.
 *
 * @param event - A `ScheduleEventData` originating from this calendar.
 * @returns The `TimeEntry` the event was built from.
 */
export function getEntryFromEvent(event: ScheduleEventData): TimeEntry {
	return (event.payload as CalendarEventPayload).entry;
}

/**
 * Converts a `@mantine/schedule` local wall-clock string (`"YYYY-MM-DD HH:mm:ss"`)
 * to a UTC ISO 8601 string.
 *
 * Goes through `"YYYY-MM-DDTHH:mm:ss"` rather than handing the space-separated
 * form straight to `Date` — the space-separated form isn't reliably parsed as
 * local time across browsers (Safari in particular).
 *
 * @param value - A schedule datetime string, e.g. `"2026-07-30 14:00:00"`.
 * @returns UTC ISO 8601 string suitable for `time_entry.start_time`/`end_time`.
 */
export function scheduleStringToIso(value: string): string {
	return new Date(value.replace(" ", "T")).toISOString();
}

/**
 * Filters entries down to the ones the calendar can render in the visible
 * day/week window.
 *
 * Only `finalized`/`parked` entries with both `start_time` and `end_time` set
 * can be placed on the grid (`running`/`paused` entries have a `NULL` end and
 * are excluded). `rangeStart`/`rangeEnd` are padded by one day on each side so
 * events that hang over the edge of the visible range (e.g. a late-night entry
 * crossing midnight) still render.
 *
 * @param entries    - Candidate entries (typically `useTimeEntriesStore().allEntries`).
 * @param rangeStart - Start of the visible day/week.
 * @param rangeEnd   - End of the visible day/week.
 * @returns The subset of `entries` that overlap `[rangeStart, rangeEnd]` (±1 day).
 */
export function filterEntriesForVisibleRange(entries: TimeEntry[], rangeStart: Date, rangeEnd: Date): TimeEntry[] {
	const bufferedStart = new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000);
	const bufferedEnd = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);

	return entries.filter((entry) => {
		if (entry.timer_state !== "finalized" && entry.timer_state !== "parked") return false;
		if (!entry.start_time || !entry.end_time) return false;

		const start = new Date(entry.start_time);
		const end = new Date(entry.end_time);

		return end.getTime() > bufferedStart.getTime() && start.getTime() < bufferedEnd.getTime();
	});
}

/**
 * Duration between two ISO 8601 timestamps, in seconds — for building a
 * `time_entry.duration` PATCH payload after a calendar drag/resize.
 *
 * @param startIso - Range start, ISO 8601.
 * @param endIso   - Range end, ISO 8601.
 * @returns Whole seconds between the two timestamps (may be 0 or negative if `endIso` precedes `startIso`; callers should guard against that separately).
 */
export function rangeDurationSeconds(startIso: string, endIso: string): number {
	return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
}
