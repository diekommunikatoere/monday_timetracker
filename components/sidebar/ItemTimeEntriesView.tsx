// components/sidebar/ItemTimeEntriesView.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Flex, Text, Card, Group, Badge, Divider, ScrollArea } from "@mantine/core";
import { useItemTimeEntriesStore } from "@/stores/itemTimeEntriesStore";
import { useUserStore } from "@/stores/userStore";
import { TimeEntryTable } from "../shared/time-entries/TimeEntryTable";
import { formatDuration } from "@/lib/utils";
import { TimeEntry } from "@/types/time-entry";
import { useToast } from "@/components/ToastProvider";
import DeleteConfirmationDialog from "../shared/time-entries/DeleteConfirmationDialog";

export interface ItemTimeEntriesViewProps {
	timeEntries: TimeEntry[];
	itemId: string;
	boardId: string;
	onEdit: (entry: TimeEntry) => void;
}

export function ItemTimeEntriesView({ timeEntries, itemId, boardId, onEdit }: ItemTimeEntriesViewProps) {
	const { loading, error, totalDuration, durationByRole, setItemContext, fetchItemTimeEntries, refetch } = useItemTimeEntriesStore();

	const currentUserId = useUserStore((s) => s.supabaseUser?.id);
	const { showToast } = useToast();

	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);

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
			setSelectedIds(timeEntries.map((e) => e.id));
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

	return (
		<Flex direction="column" gap="md" p="md" style={{ height: "100%" }}>
			{/* Aggregations */}
			<Group gap="sm">
				{Object.values(durationByRole).map((role) => (
					<Card key={role.roleId} withBorder padding="xs" radius="md" style={{ flex: 1, minWidth: "150px" }}>
						<Text size="xs" c="dimmed" tt="uppercase" fw={700}>
							{role.roleName}
						</Text>
						<Text fw={700} size="xl">
							{formatDuration(role.duration)}
						</Text>
					</Card>
				))}
			</Group>

			<Divider />

			{/* Table */}
			<ScrollArea style={{ flex: 1 }}>
				<TimeEntryTable timeEntries={timeEntries} loading={loading} error={error} selectedIds={selectedIds} onSelectRow={handleSelectRow} onSelectAll={handleSelectAll} onEdit={onEdit} onDelete={handleDeleteRequest} currentUserId={currentUserId} showUserColumn={true} />
			</ScrollArea>

			<DeleteConfirmationDialog show={showDeleteConfirm} onConfirm={handleConfirmDelete} onCancel={() => setShowDeleteConfirm(false)} count={1} />
		</Flex>
	);
}
