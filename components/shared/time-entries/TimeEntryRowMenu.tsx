"use client";

import { Menu } from "@mantine/core";
import { IconButton, Icon } from "@/components";

export interface TimeEntryRowMenuProps<T> {
	entry: T;
	onEdit?: (entry: T) => void;
	onDelete?: (entry: T) => void;
}

export function TimeEntryRowMenu<T>({ entry, onEdit, onDelete }: TimeEntryRowMenuProps<T>) {
	return (
		<Menu shadow="md" width={200} position="bottom-end">
			<Menu.Target>
				<IconButton variant="subtle" color="gray" size="sm" aria-label="Aktionen">
					<Icon name="moreVert" size={18} />
				</IconButton>
			</Menu.Target>

			<Menu.Dropdown>
				{onEdit ? (
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
