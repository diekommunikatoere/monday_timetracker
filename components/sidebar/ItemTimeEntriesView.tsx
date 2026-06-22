// components/sidebar/ItemTimeEntriesView.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { Flex, Text, Card, SimpleGrid, Group, Badge, Divider, ScrollArea, Accordion, Avatar } from "@mantine/core";
import { Icon } from "@/components";
import { useItemTimeEntriesStore } from "@/stores/itemTimeEntriesStore";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import { TimeEntryTable } from "../shared/time-entries/TimeEntryTable";
import { getSidebarColumns } from "../shared/time-entries/TimeEntryTableConfigs";
import { formatDuration } from "@/lib/utils";
import { TimeEntry } from "@/types/time-entry";
import { useToast } from "@/components/ToastProvider";
import DeleteConfirmationDialog from "../shared/time-entries/DeleteConfirmationDialog";

import styles from "@/components/styles/features/sidebar/ItemTimeEntriesView.module.css";

/**
 * Props for {@link ItemTimeEntriesView}.
 *
 * @property timeEntries - Pre-fetched {@link TimeEntry} rows for the item, grouped/totalled here by user.
 * @property itemId      - monday item id; sets the context on `useItemTimeEntriesStore` and drives the fetch effect.
 * @property boardId     - monday board id owning the item; part of the store context.
 * @property onEdit      - Invoked with the entry to edit (passed through to the table's edit column).
 */
export interface ItemTimeEntriesViewProps {
	timeEntries: TimeEntry[];
	itemId: string;
	boardId: string;
	onEdit: (entry: TimeEntry) => void;
}

/**
 * Renders all time entries logged against a single monday item, inside the
 * item sidebar.
 *
 * On mount/change of `itemId`/`boardId` it calls `setItemContext` +
 * `fetchItemTimeEntries` on `useItemTimeEntriesStore` (which owns `loading`,
 * `error`, `totalDuration`, `durationByRole`, `durationByUser`). The view shows
 * a row of per-**role** duration cards (from `durationByRole`), then groups the
 * passed-in `timeEntries` by `user_id` — each group is an {@link Accordion} item
 * with an avatar, the user name, a total-duration {@link Badge}, and a
 * {@link TimeEntryTable} using {@link getSidebarColumns}.
 *
 * Row selection is restricted to the current user's own entries (`currentUserId`
 * from `useUserStore`); delete goes through `DELETE /api/time-entries/:id` with
 * the `sessionToken` from `useMondayStore` and is confirmed via
 * {@link DeleteConfirmationDialog}. `duration` values are **seconds** and are
 * rendered with {@link formatDuration}.
 *
 * Reads from: `useItemTimeEntriesStore`, `useUserStore`, `useMondayStore`,
 * `useToast`.
 *
 * @param props - Component props.
 * @returns A flex column: role-aggregation cards, a divider, and a scrollable grouped table area.
 */
export function ItemTimeEntriesView({ timeEntries, itemId, boardId, onEdit }: ItemTimeEntriesViewProps) {
	const { loading, error, totalDuration, durationByRole, durationByUser, setItemContext, fetchItemTimeEntries, refetch } = useItemTimeEntriesStore();

	const currentUserId = useUserStore((s) => s.supabaseUser?.id);
	const { sessionToken } = useMondayStore();
	const { showToast } = useToast();

	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);

	const [open, setOpen] = useState<string[] | null>(null);

	useEffect(() => {
		setItemContext(itemId, boardId);
		fetchItemTimeEntries();
	}, [itemId, boardId, setItemContext, fetchItemTimeEntries]);

	const handleSelectRow = (id: string, selected: boolean) => {
		if (selected) {
			setSelectedIds((prev) => [...prev, id]);
		} else {
			setSelectedIds((prev) => prev.filter((i) => i !== id));
		}
	};

	const handleSelectAll = (selected: boolean) => {
		if (selected) {
			const ownEntryIds = timeEntries.filter((e) => e.user_id === currentUserId).map((e) => e.id);
			setSelectedIds(ownEntryIds);
		} else {
			setSelectedIds([]);
		}
	};

	const handleDeleteRequest = (entry: TimeEntry) => {
		setPendingDelete(entry);
		setShowDeleteConfirm(true);
	};

	const handleConfirmDelete = async () => {
		if (!pendingDelete) return;

		try {
			const response = await fetch(`/api/time-entries/${pendingDelete.id}`, {
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${sessionToken}`,
				},
			});

			if (!response.ok) throw new Error("Löschen fehlgeschlagen");

			showToast("Eintrag gelöscht", "positive", 2000);
			refetch();
		} catch (err) {
			showToast("Fehler beim Löschen", "negative", 2000);
		} finally {
			setShowDeleteConfirm(false);
			setPendingDelete(null);
		}
	};

	const groupedEntries = useMemo(() => {
		const groups: Record<string, { userId: string; userName: string; userPhotoUrl: string | null; entries: TimeEntry[]; totalDuration: number }> = {};
		timeEntries.forEach((entry) => {
			const userId = entry.user_id;
			const userName = (entry as any).user_name || durationByUser[userId]?.userName || "Unbekannter Benutzer";
			const userPhotoUrl = (entry as any).user_photo_urls?.thumb_small || null;

			if (!groups[userId]) {
				groups[userId] = { userId, userName, userPhotoUrl, entries: [], totalDuration: 0 };
			}
			groups[userId].entries.push(entry);
			groups[userId].totalDuration += entry.duration;
		});
		return Object.values(groups).sort((a, b) => b.totalDuration - a.totalDuration);
	}, [timeEntries, durationByUser]);

	const columns = getSidebarColumns({
		onEdit,
		onDelete: handleDeleteRequest,
		currentUserId,
	});

	return (
		<Flex direction="column" style={{ height: "100%" }}>
			{/* Aggregations by Role */}
			<SimpleGrid p="sm" type="container" cols={{ base: 1, "500px": 2, "620px": 3, "800px": 4 }} spacing="sm">
				{Object.values(durationByRole).map((role) => (
					<Card key={role.roleId} withBorder padding="md" radius="md" style={{ flex: 1, minWidth: "150px", flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderColor: "var(--color--border-ui)" }}>
						<Text size="xs" c={"var(--color--text-secondary)"} tt="uppercase" fw={700} lh={1}>
							{role.roleName}
						</Text>
						<Text c={"var(--color--text-primary)"} fw={700} size="sm" lh={1}>
							{formatDuration(role.duration)}
						</Text>
					</Card>
				))}
			</SimpleGrid>

			<Divider color="var(--color--border-layout)" m={"sm"} />

			{/* Grouped Tables */}
			<ScrollArea style={{ flex: 1 }}>
				{loading && timeEntries.length === 0 ? (
					<Flex justify="center" p="xl">
						<Text>Lade Zeiteinträge...</Text>
					</Flex>
				) : error ? (
					<Flex justify="center" p="xl">
						<Text c="red">{error}</Text>
					</Flex>
				) : groupedEntries.length === 0 ? (
					<Flex justify="center" p="xl">
						<Text>Keine Zeiteinträge gefunden.</Text>
					</Flex>
				) : (
					<Accordion multiple value={open || []} onChange={(values) => setOpen(values.length > 0 ? values : null)} disableChevronRotation classNames={styles} p="sm">
						{groupedEntries.map((group) => (
							<Accordion.Item key={group.userId} value={group.userId}>
								<Accordion.Control chevron={open && open.includes(group.userId) ? <Icon name={"collapse"} size={16} color="var(--color--icon)" /> : <Icon name={"expand"} size={16} color="var(--color--icon)" />}>
									<Group justify="space-between" pr="md">
										<Flex direction="row" align="center" gap="sm">
											<Avatar src={group.userPhotoUrl} alt={group.userName} radius="xl" size="sm">
												{group.userName.charAt(0)}
											</Avatar>
											<Text fw={600}>{group.userName}</Text>
										</Flex>
										<Badge variant="light" size="lg" style={{ pointerEvents: "none" }}>
											{formatDuration(group.totalDuration)}
										</Badge>
									</Group>
								</Accordion.Control>
								<Accordion.Panel>
									<Flex style={{ flex: 1, width: "100%" }}>
										<TimeEntryTable timeEntries={group.entries} columns={columns} scrollable />
									</Flex>
								</Accordion.Panel>
							</Accordion.Item>
						))}
					</Accordion>
				)}
			</ScrollArea>

			<DeleteConfirmationDialog show={showDeleteConfirm} onConfirm={handleConfirmDelete} onCancel={() => setShowDeleteConfirm(false)} count={1} />
		</Flex>
	);
}
