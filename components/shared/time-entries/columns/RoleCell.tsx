// components/shared/time-entries/columns/RoleCell.tsx
import { Flex, Text, Tooltip, ActionIcon } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { Icon } from "@/components";

interface RoleCellProps {
	entry: TimeEntry;
	showCommentIcon?: boolean;
}

export function RoleCell({ entry, showCommentIcon = false }: RoleCellProps) {
	return (
		<Flex align="center" gap="xs">
			<Text size="sm">{entry.role_name || "-"}</Text>
			{showCommentIcon && entry.comment && (
				<Tooltip label={entry.comment} withArrow position="top">
					<ActionIcon variant="subtle" color="gray" size="xs" aria-label="Kommentar anzeigen">
						<Icon name="comment" size={14} />
					</ActionIcon>
				</Tooltip>
			)}
		</Flex>
	);
}
