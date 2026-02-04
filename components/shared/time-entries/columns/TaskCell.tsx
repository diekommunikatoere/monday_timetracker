// components/shared/time-entries/columns/TaskCell.tsx
import { Flex, Text, Badge } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { TimeEntryRowMenu } from "../TimeEntryRowMenu";

interface TaskCellProps {
	entry: TimeEntry;
	onEdit?: (entry: TimeEntry) => void;
	onDelete?: (entry: TimeEntry) => void;
	style?: React.CSSProperties;
}

export function TaskCell({ entry, onEdit, onDelete, style }: TaskCellProps) {
	return (
		<Flex align="center" justify="space-between" gap="xs" style={style}>
			<Flex justify={"start"} align={"center"} columnGap="xs" rowGap="2px" wrap="wrap">
				{entry.is_draft && (
					<Badge size="xs" style={{ backgroundColor: "var(--color--surface-primary)", color: "var(--color--text-primary)" }}>
						DRAFT
					</Badge>
				)}
				<Text size="sm" fw={500} truncate>
					{entry.item_name || entry.task_name || "-"}
				</Text>
				<Text size="xs" style={{ fontStyle: "italic", color: "var(--color--text-secondary)" }}>
					{entry.parent_item_name || ""}
				</Text>
			</Flex>
			<TimeEntryRowMenu entry={entry} onEdit={onEdit} onDelete={onDelete} />
		</Flex>
	);
}
