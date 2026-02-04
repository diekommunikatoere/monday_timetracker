// components/shared/time-entries/columns/RoleCell.tsx
import { Flex, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { Icon } from "@/components";

interface RoleCellProps {
	entry: TimeEntry;
	showCommentIcon?: boolean;
	style?: React.CSSProperties;
}

export function RoleCell({ entry, showCommentIcon = false, style }: RoleCellProps) {
	return (
		<Flex align="center" gap="xs" style={style}>
			<Text size="sm">{entry.role_name || "-"}</Text>
			{showCommentIcon && entry.comment && (
				<Tooltip label={entry.comment} withArrow position="top">
					<UnstyledButton aria-label="Kommentar anzeigen" disabled style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "help" }}>
						<Icon name="comment" size={14} />
					</UnstyledButton>
				</Tooltip>
			)}
		</Flex>
	);
}
