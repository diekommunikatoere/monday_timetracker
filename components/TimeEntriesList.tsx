"use client";

import { TimeEntry } from "@/types/time-entry";
import { formatDuration, formatTimestamp } from "@/lib/utils";

interface TimeEntriesListProps {
	entries: TimeEntry[];
}

export default function TimeEntriesList({ entries }: TimeEntriesListProps) {
	if (entries.length === 0) {
		return (
			<div className="time-entries-container">
				<h2>Time Entries</h2>
				<p className="no-entries">No time entries logged yet.</p>
			</div>
		);
	}

	return (
		<div className="time-entries-container">
			<h2>Time Entries</h2>
			<div className="entries-table-container">
				<table className="entries-table">
					<thead>
						<tr>
							<th>Task Name</th>
							<th>Start Time</th>
							<th>End Time</th>
							<th>Duration</th>
						</tr>
					</thead>
					<tbody>
						{entries.map((entry) => (
							<tr key={entry.id} className="entry-row">
								<td className="task-name">{entry.task_name}</td>
								<td className="timestamp">{formatTimestamp(entry.start_time)}</td>
								<td className="timestamp">{formatTimestamp(entry.end_time)}</td>
								<td className="duration">{formatDuration(entry.duration)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
