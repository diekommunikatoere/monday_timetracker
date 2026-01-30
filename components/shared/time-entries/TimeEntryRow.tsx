// components/shared/time-entries/TimeEntryRow.tsx
"use client";

import { Table, Checkbox, Text, Flex } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { formatDuration } from "@/lib/utils";
import { TimeEntryRowMenu } from "./TimeEntryRowMenu";
import { useTimeEntryPermissions } from "../hooks/useTimeEntryPermissions";

export interface TimeEntryRowProps {
	entry: TimeEntry;
	currentUserId: string | undefined;
	isSelected: boolean;
	onSelect: (id: string, selected: boolean) => void;
	onEdit?: (entry: TimeEntry) => void;
	onDelete?: (entry: TimeEntry) => void;
	showUserColumn?: boolean;
	showCheckbox?: boolean;
}

export function TimeEntryRow({ entry, currentUserId, isSelected, onSelect, onEdit, onDelete, showUserColumn = false, showCheckbox = false }: TimeEntryRowProps) {
	const permissions = useTimeEntryPermissions({ entry, currentUserId });

	const startDate = new Date(entry.start_time);
	const endDate = new Date(entry.end_time);

	return (
		<Table.Tr bg={isSelected ? "var(--mantine-color-blue-light)" : undefined}>
			{showCheckbox && (
				<Table.Td>
					<Checkbox checked={isSelected} onChange={(e) => onSelect(entry.id, e.currentTarget.checked)} disabled={!permissions.canBulkSelect} aria-label={`Select time entry ${entry.id}`} />
				</Table.Td>
			)}
			{showUserColumn && <Table.Td>{entry.user_id}</Table.Td>}
			<Table.Td>{entry.role_name || "-"}</Table.Td>
			<Table.Td>{entry.comment || "-"}</Table.Td>
			<Table.Td>
				{startDate.toLocaleDateString("de-DE", {
					day: "2-digit",
					month: "2-digit",
					year: "numeric",
				})}
			</Table.Td>
			<Table.Td>
				{startDate.toLocaleTimeString("de-DE", {
					hour: "2-digit",
					minute: "2-digit",
				})}{" "}
				Uhr
			</Table.Td>
			<Table.Td>
				{endDate.toLocaleTimeString("de-DE", {
					hour: "2-digit",
					minute: "2-digit",
				})}{" "}
				Uhr
			</Table.Td>
			<Table.Td>{formatDuration(entry.duration)}</Table.Td>
		</Table.Tr>
	);
}
