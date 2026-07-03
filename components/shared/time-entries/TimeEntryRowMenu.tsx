"use client";

import { Menu } from "@mantine/core";
import { IconButton, Icon } from "@/components";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntryPermissions } from "../hooks/useTimeEntryPermissions";
import { TimeEntry } from "@/types/time-entry";

/**
 * Props for {@link TimeEntryRowMenu}.
 *
 * Generic over the row type `T` so the menu can be reused with any shape that
 * carries the fields the permission check needs (`id`, `user_id`, `timer_state`).
 *
 * @typeParam T - Row shape; must expose `id`, `user_id`, and optional `timer_state`.
 * @property entry    - The row to render the menu for.
 * @property onEdit   - Optional edit handler; only shown when the user has `canEdit`. For draft entries it acts as a save action and is labelled "Speichern".
 * @property onDelete - Optional delete handler; only shown when the user has `canDelete`.
 * @property style    - Optional inline style applied to the trigger `IconButton`.
 */
export interface TimeEntryRowMenuProps<T> {
	entry: T;
	onEdit?: (entry: T) => void;
	onDelete?: (entry: T) => void;
	style?: React.CSSProperties;
}

/**
 * Per-row actions menu (edit / save-draft / delete) for a time entry.
 *
 * Reads the current user's Supabase id from {@link useUserStore} and derives
 * `canEdit` / `canDelete` via {@link useTimeEntryPermissions}. Renders
 * **nothing** (`null`) when the current user has neither permission — i.e. for
 * rows owned by other users. For non-finalized entries (`timer_state !== "finalized"`)
 * the edit item is relabelled to a save ("Speichern") action. Styled with CSS vars
 * (`--color--border-ui`, `--color--background-primary`, `--box-shadow--md`).
 *
 * @typeParam T - Row shape with at least `{ id, user_id, timer_state?, style? }`.
 * @param props - {@link TimeEntryRowMenuProps}.
 * @returns A Mantine `Menu` with the applicable items, or `null` if the user can neither edit nor delete.
 */
export function TimeEntryRowMenu<T extends { id: string; user_id: string; timer_state?: string; style?: React.CSSProperties }>({ entry, onEdit, onDelete, style }: TimeEntryRowMenuProps<T>) {
	const currentUserId = useUserStore((s) => s.supabaseUser?.id);
	const { canEdit, canDelete } = useTimeEntryPermissions({
		entry: entry as unknown as TimeEntry,
		currentUserId,
	});

	const isDraft = entry.timer_state !== undefined && entry.timer_state !== "finalized";

	if (!canEdit && !canDelete) {
		return null;
	}

	return (
		<Menu width={150} position="bottom-end" withArrow styles={{ arrow: { borderColor: "var(--color--border-ui)" }, dropdown: { backgroundColor: "var(--color--background-primary)", borderColor: "var(--color--border-ui)", boxShadow: "var(--box-shadow--md)" } }}>
			<Menu.Target>
				<IconButton variant="filled" colorVariant="tertiary" size="sm" aria-label="Aktionen" style={style}>
					<Icon name="moreVert" size={18} color="var(--color--icon)" />
				</IconButton>
			</Menu.Target>

			<Menu.Dropdown>
				{isDraft && canEdit ? (
					<Menu.Item leftSection={<Icon name="save" size={16} color="var(--color--icon)" />} onClick={() => onEdit?.(entry)}>
						Speichern
					</Menu.Item>
				) : onEdit && canEdit ? (
					<Menu.Item leftSection={<Icon name="edit" size={16} color="var(--color--icon)" />} onClick={() => onEdit(entry)}>
						Bearbeiten
					</Menu.Item>
				) : null}
				{onDelete && canDelete ? (
					<Menu.Item leftSection={<Icon name="delete" size={16} color="var(--color--icon)" />} color="red" onClick={() => onDelete(entry)}>
						Löschen
					</Menu.Item>
				) : null}
			</Menu.Dropdown>
		</Menu>
	);
}
