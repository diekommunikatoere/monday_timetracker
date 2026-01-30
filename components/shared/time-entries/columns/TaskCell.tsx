// components/shared/time-entries/columns/TaskCell.tsx
import { Flex, Text } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { TimeEntryRowMenu } from "../TimeEntryRowMenu";

interface TaskCellProps {
	entry: TimeEntry;
	onEdit?: (entry: TimeEntry) => void;
	onDelete?: (entry: TimeEntry) => void;
}

export function TaskCell({ entry, onEdit, onDelete }: TaskCellProps) {
	return (
		<Flex align="center" justify="space-between" gap="xs">
			<Flex justify={"center"} align={"center"} gap="xs">
				<Text size="sm" fw={500} truncate>
					{entry.item_name || entry.task_name || "-"}
				</Text>
				<Text size="xs" truncate style={{ fontStyle: "italic", color: "var(--color--text-secondary)" }}>
					{entry.parent_item_name || ""}
				</Text>
			</Flex>
			<TimeEntryRowMenu entry={entry} onEdit={onEdit} onDelete={onDelete} />
		</Flex>
	);
}
