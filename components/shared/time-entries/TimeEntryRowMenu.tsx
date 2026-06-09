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
    style?: React.CSSProperties;
}

export function TimeEntryRowMenu<
    T extends { id: string; user_id: string; is_draft?: boolean; style?: React.CSSProperties },
>({ entry, onEdit, onDelete, style }: TimeEntryRowMenuProps<T>) {
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
        <Menu
            width={150}
            position="bottom-end"
            withArrow
            styles={{
                arrow: { borderColor: "var(--color--border-ui)" },
                dropdown: {
                    backgroundColor: "var(--color--background-primary)",
                    borderColor: "var(--color--border-ui)",
                    boxShadow: "var(--box-shadow--md)",
                },
            }}
        >
            <Menu.Target>
                <IconButton variant="tertiary" size="sm" aria-label="Aktionen" style={style}>
                    <Icon name="moreVert" size={18} color="var(--color--icon)" />
                </IconButton>
            </Menu.Target>

            <Menu.Dropdown>
                {isDraft && canEdit ? (
                    <Menu.Item
                        leftSection={<Icon name="save" size={16} color="var(--color--icon)" />}
                        onClick={() => onEdit?.(entry)}
                    >
                        Speichern
                    </Menu.Item>
                ) : onEdit && canEdit ? (
                    <Menu.Item
                        leftSection={<Icon name="edit" size={16} color="var(--color--icon)" />}
                        onClick={() => onEdit(entry)}
                    >
                        Bearbeiten
                    </Menu.Item>
                ) : null}
                {onDelete && canDelete ? (
                    <Menu.Item
                        leftSection={<Icon name="delete" size={16} color="var(--color--icon)" />}
                        color="red"
                        onClick={() => onDelete(entry)}
                    >
                        Löschen
                    </Menu.Item>
                ) : null}
            </Menu.Dropdown>
        </Menu>
    );
}
