// components/shared/time-entries/columns/TaskCell.tsx
import { Flex, Text, Badge } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { TimeEntryRowMenu } from "../TimeEntryRowMenu";

/**
 * Props for {@link TaskCell}.
 *
 * @property entry    - The {@link TimeEntry} to render; reads `item_name`, `task_name`, `parent_item_name`, and `timer_state`.
 * @property onEdit   - Optional; forwarded to the embedded {@link TimeEntryRowMenu} as the edit action.
 * @property onDelete - Optional; forwarded to the embedded {@link TimeEntryRowMenu} as the delete action.
 * @property style    - Optional inline style for the wrapping `Flex`.
 */
interface TaskCellProps {
	entry: TimeEntry;
	onEdit?: (entry: TimeEntry) => void;
	onDelete?: (entry: TimeEntry) => void;
	style?: React.CSSProperties;
}

/**
 * Table cell renderer for the **task** column in the dashboard view.
 *
 * Shows a `DRAFT` badge when `entry.timer_state !== "finalized"`, then the task name
 * preferring `entry.item_name` and falling back to `entry.task_name` (or `"-"`), followed
 * by the italic parent-item name when present. Renders an embedded
 * {@link TimeEntryRowMenu} on the right that gates its own edit/delete items by
 * ownership via {@link useTimeEntryPermissions}.
 *
 * @param props - {@link TaskCellProps}.
 * @returns A `Flex` row with task text and a row-actions menu.
 */
export function TaskCell({ entry, onEdit, onDelete, style }: TaskCellProps) {
	return (
		<Flex align="center" justify="space-between" gap="xs" style={style}>
			<Flex justify={"start"} align={"center"} columnGap="xs" rowGap="2px" wrap="wrap">
				{entry.timer_state !== "finalized" && (
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
