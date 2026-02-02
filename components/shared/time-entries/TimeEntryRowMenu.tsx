"use client";

import { Menu } from "@mantine/core";
import { IconButton, Icon } from "@/components";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntryPermissions } from "../hooks/useTimeEntryPermissions";
import { TimeEntry } from "@/types/time-entry";

export interface TimeEntryRowMenuProps<T> {
	entry: T;
	onEdit?: (entry: T) => void;
	onDelete?: (entry: T) => void;
}

export function TimeEntryRowMenu<T extends { id: string; user_id: string; is_draft?: boolean }>({ entry, onEdit, onDelete }: TimeEntryRowMenuProps<T>) {
	const currentUserId = useUserStore((s) => s.supabaseUser?.id);
	const { canEdit, canDelete } = useTimeEntryPermissions({
		entry: entry as unknown as TimeEntry,
		currentUserId,
	});

	const isDraft = entry.is_draft;

	if (!canEdit && !canDelete) {
		return null;
	}

	return (
		<Menu shadow="md" width={200} position="bottom-end">
			<Menu.Target>
				<IconButton variant="subtle" color="gray" size="sm" aria-label="Aktionen">
					<Icon name="moreVert" size={18} />
				</IconButton>
			</Menu.Target>

			<Menu.Dropdown>
				{isDraft && canEdit ? (
					<Menu.Item leftSection={<Icon name="save" size={16} />} onClick={() => onEdit?.(entry)}>
						Speichern
					</Menu.Item>
				) : onEdit && canEdit ? (
					<Menu.Item leftSection={<Icon name="edit" size={16} />} onClick={() => onEdit(entry)}>
						Bearbeiten
					</Menu.Item>
				) : null}
				{onDelete && canDelete ? (
					<Menu.Item leftSection={<Icon name="delete" size={16} />} color="red" onClick={() => onDelete(entry)}>
						Löschen
					</Menu.Item>
				) : null}
			</Menu.Dropdown>
		</Menu>
	);
}
