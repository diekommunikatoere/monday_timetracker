"use client";

import { Menu } from "@mantine/core";
import { IconButton, Icon } from "@/components";

export interface TimeEntryRowMenuProps<T> {
	entry: T;
	onEdit?: (entry: T) => void;
	onDelete?: (entry: T) => void;
}

export function TimeEntryRowMenu<T extends { is_draft?: boolean }>({ entry, onEdit, onDelete }: TimeEntryRowMenuProps<T>) {
	const isDraft = entry.is_draft;

	return (
		<Menu shadow="md" width={200} position="bottom-end">
			<Menu.Target>
				<IconButton variant="subtle" color="gray" size="sm" aria-label="Aktionen">
					<Icon name="moreVert" size={18} />
				</IconButton>
			</Menu.Target>

			<Menu.Dropdown>
				{isDraft ? (
					<Menu.Item leftSection={<Icon name="save" size={16} />} onClick={() => onEdit?.(entry)}>
						Speichern
					</Menu.Item>
				) : onEdit ? (
					<Menu.Item leftSection={<Icon name="edit" size={16} />} onClick={() => onEdit(entry)}>
						Bearbeiten
					</Menu.Item>
				) : null}
				{onDelete ? (
					<Menu.Item leftSection={<Icon name="delete" size={16} />} color="red" onClick={() => onDelete(entry)}>
						Löschen
					</Menu.Item>
				) : null}
			</Menu.Dropdown>
		</Menu>
	);
}
