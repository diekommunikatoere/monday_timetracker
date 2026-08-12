"use client";

import { Menu } from "@mantine/core";

import { IconButton, Icon } from "@/components";
import { useUserStore } from "@/stores/userStore";
import { TimeEntry } from "@/types/time-entry";

import { useTimeEntryPermissions } from "../hooks/useTimeEntryPermissions";

/**
 * Props for {@link TimeEntryRowMenu}.
 *
 * Generic over the row type `T` so the menu can be reused with any shape that
 * carries the fields the permission check needs (`id`, `user_id`, `timer_state`).
 *
 * @typeParam T - Row shape; must expose `id`, `user_id`, and optional `timer_state`.
 * @property entry       - The row to render the menu for.
 * @property onEdit      - Optional edit handler; only shown when the user has `canEdit` **and** the entry is `finalized` or `parked`. A plain field edit never changes `timer_state`, and that's only safe once a timer is fully detached — a `paused` entry is still live/segment-governed (`duration`/`end_time` are `NULL` until park or finalize recomputes them from segments), so it's deliberately excluded here; use `onSaveDraft` for it instead.
 * @property onDelete    - Optional delete handler; only shown when the user has `canDelete`.
 * @property onSaveDraft - Optional finalize handler; only shown (as "Speichern") for draft entries (`timer_state !== "finalized"`, i.e. `running`/`paused`/`parked`) when the user has `canEdit`.
 * @property style       - Optional inline style applied to the trigger `IconButton`.
 */
export interface TimeEntryRowMenuProps<T> {
	entry: T;
	onEdit?: (entry: T) => void;
	onDelete?: (entry: T) => void;
	onSaveDraft?: (entry: T) => void;
	style?: React.CSSProperties;
}

/**
 * Per-row actions menu (edit / save-draft / delete) for a time entry.
 *
 * Reads the current user's Supabase id from {@link useUserStore} and derives
 * `canEdit` / `canDelete` via {@link useTimeEntryPermissions}. Renders
 * **nothing** (`null`) when the current user has neither permission — i.e. for
 * rows owned by other users. For non-finalized (draft) entries, an additional
 * "Speichern" item finalizes the entry via `onSaveDraft`. The "Bearbeiten" edit
 * item is shown for `finalized` and `parked` entries only — **not** `paused`
 * (or `running`), since those are still live/segment-governed and a plain
 * field edit isn't safe for them (see {@link TimeEntryRowMenuProps.onEdit}).
 * Styled with CSS vars (`--color--border-ui`, `--color--background-primary`,
 * `--box-shadow--md`).
 *
 * @typeParam T - Row shape with at least `{ id, user_id, timer_state?, style? }`.
 * @param props - {@link TimeEntryRowMenuProps}.
 * @returns A Mantine `Menu` with the applicable items, or `null` if the user can neither edit nor delete.
 */
export function TimeEntryRowMenu<T extends { id: string; user_id: string; timer_state?: string; style?: React.CSSProperties }>({ entry, onEdit, onDelete, onSaveDraft, style }: TimeEntryRowMenuProps<T>) {
	const currentUserId = useUserStore((s) => s.supabaseUser?.id);
	const { canEdit, canDelete } = useTimeEntryPermissions({
		entry: entry as unknown as TimeEntry,
		currentUserId,
	});

	const isDraft = entry.timer_state !== undefined && entry.timer_state !== "finalized";
	// Editable via plain field PATCH: finalized (always) or parked (fully detached from
	// the live timer). paused/running entries are still segment-governed — their
	// duration/end_time are NULL until park/finalize recomputes them — so a direct edit
	// would seed garbage and be silently discarded on the next timer transition.
	const isEditable = entry.timer_state === undefined || entry.timer_state === "finalized" || entry.timer_state === "parked";

	if (!canEdit && !canDelete) {
		return null;
	}

	return (
		<Menu width={150} position="bottom-end" withArrow styles={{ arrow: { borderColor: "var(--color--border-ui)" }, dropdown: { backgroundColor: "var(--color--background-primary)", borderColor: "var(--color--border-ui)", boxShadow: "var(--box-shadow--md)" } }}>
			<Menu.Target>
				<IconButton variant="filled" colorVariant="tertiary" size="sm" aria-label="Aktionen" style={style}>
					<Icon name="more_vert" size={18} />
				</IconButton>
			</Menu.Target>

			<Menu.Dropdown>
				{isDraft && canEdit ? (
					<>
						<Menu.Item leftSection={<Icon name="save" size={18} />} onClick={() => onSaveDraft?.(entry)}>
							Zuweisen
						</Menu.Item>
						<Menu.Divider />
					</>
				) : null}
				{isEditable && onEdit && canEdit ? (
					<Menu.Item leftSection={<Icon name="edit" size={18} />} onClick={() => onEdit(entry)}>
						Bearbeiten
					</Menu.Item>
				) : null}
				{onDelete && canDelete ? (
					<Menu.Item leftSection={<Icon name="delete" size={18} />} color="red" onClick={() => onDelete(entry)}>
						Löschen
					</Menu.Item>
				) : null}
			</Menu.Dropdown>
		</Menu>
	);
}
