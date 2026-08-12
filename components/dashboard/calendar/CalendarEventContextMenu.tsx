// components/dashboard/calendar/CalendarEventContextMenu.tsx
"use client";

import { Menu } from "@mantine/core";

import { Icon } from "@/components";
import { useTimeEntryPermissions } from "@/components/shared/hooks/useTimeEntryPermissions";
import { useUserStore } from "@/stores/userStore";
import { TimeEntry } from "@/types/time-entry";

/**
 * Props for {@link CalendarEventContextMenu}.
 *
 * @property entry    - The entry the menu was opened for, or `null` when closed.
 * @property position - Viewport coordinates to anchor the menu at, or `null` when closed.
 * @property onClose  - Closes the menu (outside click, Escape, or after an action).
 * @property onEdit   - "Bearbeiten" handler; shown for `finalized`/`parked` entries the user can edit.
 * @property onSaveDraft - "Zuweisen" handler; shown for `parked` entries the user can edit.
 * @property onDelete - "Löschen" handler; shown when the user can delete the entry.
 */
interface CalendarEventContextMenuProps {
	entry: TimeEntry | null;
	position: { x: number; y: number } | null;
	onClose: () => void;
	onEdit: (entry: TimeEntry) => void;
	onSaveDraft: (entry: TimeEntry) => void;
	onDelete: (entry: TimeEntry) => void;
}

/**
 * Right-click context menu for a calendar event, anchored at the pointer
 * position via a fixed-position zero-size target.
 *
 * Item set and gating mirror {@link TimeEntryRowMenu} exactly: ownership via
 * {@link useTimeEntryPermissions}, "Zuweisen" only for `parked` entries,
 * "Bearbeiten" for `finalized`/`parked`, "Löschen" whenever the user can delete.
 *
 * @param props - {@link CalendarEventContextMenuProps}.
 * @returns A controlled Mantine `Menu`, or `null` while closed.
 */
export function CalendarEventContextMenu({ entry, position, onClose, onEdit, onSaveDraft, onDelete }: CalendarEventContextMenuProps) {
	const currentUserId = useUserStore((s) => s.supabaseUser?.id);
	const { canEdit, canDelete } = useTimeEntryPermissions({
		entry: entry ?? ({} as TimeEntry),
		currentUserId,
	});

	if (!entry || !position) {
		return null;
	}

	const isDraft = entry.timer_state !== "finalized";
	const isEditable = entry.timer_state === "finalized" || entry.timer_state === "parked";

	return (
		<Menu opened onClose={onClose} position="bottom-start" withinPortal styles={{ dropdown: { backgroundColor: "var(--color--background-primary)", borderColor: "var(--color--border-ui)", boxShadow: "var(--box-shadow--md)" } }}>
			<Menu.Target>
				<div style={{ position: "fixed", top: position.y, left: position.x, width: 0, height: 0 }} />
			</Menu.Target>

			<Menu.Dropdown>
				{isDraft && canEdit ? (
					<>
						<Menu.Item
							leftSection={<Icon name="save" size={18} />}
							onClick={() => {
								onSaveDraft(entry);
								onClose();
							}}
						>
							Zuweisen
						</Menu.Item>
						<Menu.Divider />
					</>
				) : null}
				{isEditable && canEdit ? (
					<Menu.Item
						leftSection={<Icon name="edit" size={18} />}
						onClick={() => {
							onEdit(entry);
							onClose();
						}}
					>
						Bearbeiten
					</Menu.Item>
				) : null}
				{canDelete ? (
					<Menu.Item
						leftSection={<Icon name="delete" size={18} />}
						color="red"
						onClick={() => {
							onDelete(entry);
							onClose();
						}}
					>
						Löschen
					</Menu.Item>
				) : null}
			</Menu.Dropdown>
		</Menu>
	);
}

export default CalendarEventContextMenu;
