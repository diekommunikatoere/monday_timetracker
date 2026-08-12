// components/shared/time-entries/columns/TimeRangeCell.tsx
import { Text } from "@mantine/core";

import { TimeEntry } from "@/types/time-entry";

/**
 * Props for {@link TimeRangeCell}.
 *
 * @property entry - The {@link TimeEntry}; reads `entry.start_time` and `entry.end_time` as **ISO 8601 timestamp strings**.
 * @property style - Optional inline style for the text element.
 */
interface TimeRangeCellProps {
	entry: TimeEntry;
	style?: React.CSSProperties;
}

/**
 * Table cell renderer for the compact start–end **time range** column
 * (sidebar view).
 *
 * Parses `entry.start_time` and `entry.end_time` (ISO timestamps) into `Date`s
 * and renders them as `"HH:MM" – "HH:MM"` via `de-DE` locale formatting. Used by
 * {@link getSidebarColumns}. Note this is a different presentation than the
 * dashboard's separate start/end columns (which append " Uhr").
 *
 * @param props - {@link TimeRangeCellProps}.
 * @returns A `Text` showing the localized time range.
 */
export function TimeRangeCell({ entry, style }: TimeRangeCellProps) {
	const start = new Date(entry.start_time);
	const end = new Date(entry.end_time);

	const formatTime = (date: Date) =>
		date.toLocaleTimeString("de-DE", {
			hour: "2-digit",
			minute: "2-digit",
		});

	return (
		<Text size="sm" style={style}>
			{formatTime(start)} – {formatTime(end)}
		</Text>
	);
}
