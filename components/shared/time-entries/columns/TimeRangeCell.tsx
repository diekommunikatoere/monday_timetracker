// components/shared/time-entries/columns/TimeRangeCell.tsx
import { Text } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";

interface TimeRangeCellProps {
	entry: TimeEntry;
}

export function TimeRangeCell({ entry }: TimeRangeCellProps) {
	const start = new Date(entry.start_time);
	const end = new Date(entry.end_time);

	const formatTime = (date: Date) =>
		date.toLocaleTimeString("de-DE", {
			hour: "2-digit",
			minute: "2-digit",
		});

	return (
		<Text size="sm">
			{formatTime(start)} – {formatTime(end)}
		</Text>
	);
}
