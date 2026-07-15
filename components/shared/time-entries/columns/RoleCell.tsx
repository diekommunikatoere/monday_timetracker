// components/shared/time-entries/columns/RoleCell.tsx
import { Flex, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { TimeEntry } from "@/types/time-entry";
import { Icon } from "@/components";

/**
 * Props for {@link RoleCell}.
 *
 * @property entry          - The {@link TimeEntry} to render; reads `entry.role_name` and (optionally) `entry.comment`.
 * @property showCommentIcon - When `true` and `entry.comment` is non-empty, renders a comment icon whose tooltip shows the comment text.
 * @property style          - Optional inline style for the wrapping `Flex`.
 */
interface RoleCellProps {
	entry: TimeEntry;
	showCommentIcon?: boolean;
	style?: React.CSSProperties;
}

/**
 * Table cell renderer for the **role** column.
 *
 * Shows `entry.role_name` (or `"-"` when null/empty). Optionally renders a
 * small `comment` icon that, when present, surfaces `entry.comment` in a
 * tooltip — used by the sidebar column config ({@link getSidebarColumns}).
 * Rendered in both dashboard and sidebar column sets.
 *
 * @param props - {@link RoleCellProps}.
 * @returns A `Flex` with the role text and optional comment icon.
 */
export function RoleCell({ entry, showCommentIcon = false, style }: RoleCellProps) {
	return (
		<Flex align="center" gap="xs" style={style}>
			<Text size="sm">{entry.role_name || "-"}</Text>
			{showCommentIcon && entry.comment && (
				<Tooltip label={entry.comment} withArrow position="top">
					<UnstyledButton aria-label="Kommentar anzeigen" disabled style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "help" }}>
						<Icon name="comment" size={16} color="var(--color--icon)" />
					</UnstyledButton>
				</Tooltip>
			)}
		</Flex>
	);
}
