// components/dashboard/TimeEntryRowMenu.tsx
"use client";

import { Menu, ActionIcon } from "@mantine/core";
import { Icon } from "@/components/Icon";
import { TimeEntry } from "@/types/time-entry";

interface TimeEntryRowMenuProps {
	entry: TimeEntry;
	onEdit: (entry: TimeEntry) => void;
	onDelete: (entry: TimeEntry) => void;
}

export default function TimeEntryRowMenu({ entry, onEdit, onDelete }: TimeEntryRowMenuProps) {
	return (
		<Menu shadow="md" width={200} position="bottom-end">
			<Menu.Target>
				<ActionIcon variant="subtle" color="gray" size="sm" aria-label="Aktionen">
					<Icon name="moreVert" size={18} />
				</ActionIcon>
			</Menu.Target>

			<Menu.Dropdown>
				<Menu.Item leftSection={<Icon name="edit" size={16} />} onClick={() => onEdit(entry)}>
					Bearbeiten
				</Menu.Item>
				<Menu.Item leftSection={<Icon name="delete" size={16} />} color="red" onClick={() => onDelete(entry)}>
					Löschen
				</Menu.Item>
			</Menu.Dropdown>
		</Menu>
	);
}
