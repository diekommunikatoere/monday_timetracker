// components/sidebar/ItemTimeEntriesView.tsx
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Flex, Text, Card, SimpleGrid, Group, Badge, Divider, ScrollArea, Accordion, Avatar } from "@mantine/core";
import { Icon } from "@/components";
import { useItemTimeEntriesStore } from "@/stores/itemTimeEntriesStore";
import { useUserStore } from "@/stores/userStore";
import { TimeEntryTable } from "../shared/time-entries/TimeEntryTable";
import { getSidebarColumns } from "../shared/time-entries/TimeEntryTableConfigs";
import { formatDuration } from "@/lib/utils";
import { TimeEntry } from "@/types/time-entry";
import { useToast } from "@/components/ToastProvider";
import DeleteConfirmationDialog from "../shared/time-entries/DeleteConfirmationDialog";

import styles from "@/components/styles/features/sidebar/ItemTimeEntriesView.module.css";

export interface ItemTimeEntriesViewProps {
	timeEntries: TimeEntry[];
	itemId: string;
	boardId: string;
	onEdit: (entry: TimeEntry) => void;
}

export function ItemTimeEntriesView({ timeEntries, itemId, boardId, onEdit }: ItemTimeEntriesViewProps) {
	const { loading, error, totalDuration, durationByRole, durationByUser, setItemContext, fetchItemTimeEntries, refetch } = useItemTimeEntriesStore();

	const currentUserId = useUserStore((s) => s.supabaseUser?.id);
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
					userId: currentUserId || "",
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

	console.log("Grouped Entries:", groupedEntries);

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
					<Card key={role.roleId} withBorder padding="sm" radius="md" style={{ flex: 1, minWidth: "150px", flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderColor: "var(--color--border-ui)" }}>
						<Text size="xs" c="dimmed" tt="uppercase" fw={700} lh={1}>
							{role.roleName}
						</Text>
						<Text fw={700} size="sm" lh={1}>
							{formatDuration(role.duration)}
						</Text>
					</Card>
				))}
			</SimpleGrid>

			<Divider color="var(--color--border-ui)" m={"sm"} />

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
									<TimeEntryTable timeEntries={group.entries} columns={columns} />
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
