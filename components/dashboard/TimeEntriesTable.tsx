// components/dashboard/TimeEntriesTable.tsx
"use client";

import { useState, useMemo } from "react";
import { useUserStore } from "@/stores/userStore";
import { useTimerStore, useTimerComputed } from "@/stores/timerStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import { Flex, Table, Checkbox, Text, Center, Loader } from "@mantine/core";
import { IconButton } from "@/components";
import { TimeEntry } from "@/types/time-entry";
import { formatDuration } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import SaveTimerModal from "./SaveTimerModal";
import EditTimeEntryModal from "./EditTimeEntryModal";
import TimeEntryRowMenu from "./TimeEntryRowMenu";
import BulkActionButtons from "./BulkActionButtons";
import DeleteConfirmationDialog from "./DeleteConfirmationDialog";
import { TaskSelection } from "../TaskItemSelector";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

type TimeEntryWithRole = TimeEntry & { role: { name: string } };

interface TimeEntriesTableProps {
	timeEntries?: TimeEntryWithRole[];
	loading?: boolean;
	error?: string | null;
	onRefetch: () => void;
}

export default function TimeEntriesTable({ onRefetch }: TimeEntriesTableProps) {
	const { timeEntries, loading, error } = useTimeEntriesStore();
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [showSaveModal, setShowSaveModal] = useState(false);
	const [selectedDraft, setSelectedDraft] = useState<TimeEntry | null>(null);
	const [showEditModal, setShowEditModal] = useState(false);
	const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
	const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
	const [deleteCount, setDeleteCount] = useState(0);
	const [pendingDelete, setPendingDelete] = useState<(() => void) | null>(null);

	// Use new timer store selectors
	const elapsedTime = useTimerStore((s) => s.elapsedTime);
	const sessionId = useTimerStore((s) => s.sessionId);
	const draftId = useTimerStore((s) => s.draftId);
	const { isActive, isPaused, hasSession } = useTimerComputed();

	const userId = useUserStore((state) => state.supabaseUser?.id);
	const { rawContext } = useMondayStore();
	const { showToast } = useToast();

	// Selection logic
	const selectAllState = useMemo(() => {
		const total = timeEntries.length;
		const selected = selectedIds.length;
		return {
			checked: total > 0 && selected === total,
			indeterminate: selected > 0 && selected < total,
		};
	}, [selectedIds, timeEntries.length]);

	const handleSelectAll = (checked: boolean) => {
		if (checked) {
			setSelectedIds(timeEntries.map((entry) => entry.id.toString()));
		} else {
			setSelectedIds([]);
		}
	};

	const handleRowSelect = (entryId: string, checked: boolean) => {
		if (checked) {
			setSelectedIds((prev) => [...prev, entryId]);
		} else {
			setSelectedIds((prev) => prev.filter((id) => id !== entryId));
		}
	};

	// Helper function to convert seconds to HH:MM format for TimePicker
	const formatDurationAsTime = (seconds: number): string => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
	};

	const handleOpenSaveModal = (entry: TimeEntry) => {
		setSelectedDraft(entry);
		setShowSaveModal(true);
	};

	const handleCloseSaveModal = () => {
		setShowSaveModal(false);
		setSelectedDraft(null);
	};

	// Edit handlers
	const handleEdit = (entry: TimeEntry) => {
		setEditingEntry(entry);
		setShowEditModal(true);
	};

	const handleCloseEditModal = () => {
		setShowEditModal(false);
		setEditingEntry(null);
	};

	const handleEditSaved = () => {
		onRefetch();
	};

	// Delete handlers
	const handleDelete = async (entry: TimeEntry) => {
		setDeleteCount(1);
		setPendingDelete(() => async () => {
			try {
				const response = await fetch(`/api/time-entries/${entry.id}`, {
					method: "DELETE",
					headers: {
						userId: userId || "",
					},
				});

				if (!response.ok) {
					throw new Error("Failed to delete entry");
				}

				const { undoToken } = await response.json();

				showToast("Eintrag gelöscht", "warning", 5000, {
					actionLabel: "Rückgängig",
					onAction: () => handleUndo(entry.id.toString(), undoToken),
				});

				onRefetch();
			} catch (error) {
				console.error("Error deleting entry:", error);
				showToast("Fehler beim Löschen", "negative", 2000);
			}
		});
		setShowDeleteConfirmation(true);
	};

	const handleBulkDelete = async () => {
		setDeleteCount(selectedIds.length);
		setPendingDelete(() => async () => {
			try {
				const response = await fetch("/api/time-entries/bulk-delete", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						userId: userId || "",
					},
					body: JSON.stringify({
						entryIds: selectedIds,
					}),
				});

				if (!response.ok) {
					throw new Error("Failed to bulk delete entries");
				}

				const result = await response.json();

				showToast(`${result.deleted} Einträge gelöscht`, "positive", 2000);

				setSelectedIds([]);
				onRefetch();
			} catch (error) {
				console.error("Error bulk deleting entries:", error);
				showToast("Fehler beim Löschen", "negative", 2000);
			}
		});
		setShowDeleteConfirmation(true);
	};

	const handleConfirmDelete = () => {
		if (pendingDelete) {
			pendingDelete();
			setPendingDelete(null);
		}
		setShowDeleteConfirmation(false);
	};

	const handleCancelDelete = () => {
		setPendingDelete(null);
		setShowDeleteConfirmation(false);
	};

	const handleUndo = async (entryId: string, undoToken: string) => {
		try {
			const context = rawContext || (await monday.get("context"));

			const response = await fetch(`/api/time-entries/${entryId}/undo`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					userId: userId || "",
				},
				body: JSON.stringify({ undoToken }),
			});

			if (!response.ok) {
				throw new Error("Failed to undo delete");
			}

			showToast("Eintrag wiederhergestellt", "positive", 2000);

			onRefetch();
		} catch (error) {
			console.error("Error undoing delete:", error);
			showToast("Fehler beim Wiederherstellen", "negative", 2000);
		}
	};

	if (loading) {
		return (
			<Center p="xl">
				<Loader />
			</Center>
		);
	}

	if (error) {
		return (
			<Center p="xl">
				<Text c="dki-error">Error: {error}</Text>
			</Center>
		);
	}

	if (timeEntries.length === 0) {
		return (
			<Center p="xl">
				<Text>Keine Zeiteinträge gefunden.</Text>
			</Center>
		);
	}

	return (
		<>
			<Table striped highlightOnHover withColumnBorders withTableBorder withRowBorders>
				<Table.Thead>
					<Table.Tr bg="white" c="dki-black">
						<Table.Th style={{ width: 40 }}>
							<Checkbox checked={selectAllState.checked} indeterminate={selectAllState.indeterminate} onChange={(e) => handleSelectAll(e.currentTarget.checked)} aria-label="Alle Zeiteinträge auswählen" />
						</Table.Th>
						<Table.Th fw={600} maw="100px">
							Aufgabe
						</Table.Th>
						<Table.Th fw={600}>Rolle</Table.Th>
						<Table.Th fw={600}>Board</Table.Th>
						<Table.Th fw={600}>Kommentar</Table.Th>
						<Table.Th fw={600}>Datum</Table.Th>
						<Table.Th fw={600}>Start</Table.Th>
						<Table.Th fw={600}>Ende</Table.Th>
						<Table.Th fw={600}>Gesamtzeit</Table.Th>
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>
					{timeEntries.map(
						(entry) =>
							(!entry.is_draft && (
								<Table.Tr key={entry.id} bg={selectedIds.includes(entry.id.toString()) ? "dki-secondary.6" : undefined} c={selectedIds.includes(entry.id.toString()) ? "dki-black" : "inherit"}>
									<Table.Td>
										<Checkbox checked={selectedIds.includes(entry.id.toString())} onChange={(e) => handleRowSelect(entry.id.toString(), e.currentTarget.checked)} aria-label={`Select time entry ${entry.id}`} />
									</Table.Td>
									<Table.Td>
										<Flex align="center" justify="space-between">
											<Text size="sm">
												{entry.item_name}
												{entry.parent_item_name && (
													<Text span c={selectedIds.includes(entry.id.toString()) ? "dki-black" : "dki-tertiary"} fs="italic" fz={12} ml="xs">
														{entry.parent_item_name}
													</Text>
												)}
											</Text>
											<TimeEntryRowMenu entry={entry} onEdit={handleEdit} onDelete={handleDelete} />
										</Flex>
									</Table.Td>
									<Table.Td>{entry.role.name || "-"}</Table.Td>
									<Table.Td>{entry.board_name || "-"}</Table.Td>
									<Table.Td>{entry.comment || "-"}</Table.Td>
									<Table.Td>{new Date(entry.start_time).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</Table.Td>
									<Table.Td>{new Date(entry.start_time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</Table.Td>
									<Table.Td>{new Date(entry.end_time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</Table.Td>
									<Table.Td>{formatDuration(entry.duration)}</Table.Td>
								</Table.Tr>
							)) || (
								<Table.Tr key={entry.id} bg={selectedIds.includes(entry.id.toString()) ? "dki-secondary.6" : "dki-tertiary-light"} c={selectedIds.includes(entry.id.toString()) ? "dki-black" : "inherit"}>
									<Table.Td>
										<Checkbox checked={selectedIds.includes(entry.id.toString())} onChange={(e) => handleRowSelect(entry.id.toString(), e.currentTarget.checked)} aria-label={`Select time entry ${entry.id}`} />
									</Table.Td>
									<Table.Td>
										<Flex align="center" justify="space-between">
											<Text size="sm">
												{entry.task_name}
												{entry.parent_item_name && (
													<Text span c={selectedIds.includes(entry.id.toString()) ? "dki-black" : "dki-tertiary-dark"} fs="italic" fz={12} ml="xs">
														{entry.parent_item_name}
													</Text>
												)}
											</Text>
											<Flex gap={4}>
												<IconButton variant="light" color={selectedIds.includes(entry.id.toString()) ? "var(--color--tertiary-dark)" : "var(--color--contrast)"} onClick={() => handleOpenSaveModal(entry)} aria-label="Entwurf speichern">
													<Icon name="save" size={21} color={selectedIds.includes(entry.id.toString()) ? "var(--color--tertiary-dark)" : "var(--color--contrast)"} />
												</IconButton>
												<IconButton variant="light" color={selectedIds.includes(entry.id.toString()) ? "var(--color--tertiary-dark)" : "var(--color--error)"} onClick={() => handleDelete(entry)} aria-label="Entwurf löschen">
													<Icon name="delete" size={21} color={selectedIds.includes(entry.id.toString()) ? "var(--color--tertiary-dark)" : "var(--color--error)"} />
												</IconButton>
											</Flex>
										</Flex>
									</Table.Td>
									<Table.Td>{entry.role_name || "-"}</Table.Td>
									<Table.Td>{entry.board_name || "-"}</Table.Td>
									<Table.Td>{entry.comment || "-"}</Table.Td>
									<Table.Td>{new Date(entry.start_time).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</Table.Td>
									<Table.Td>{new Date(entry.start_time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</Table.Td>
									<Table.Td>{new Date(entry.end_time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr</Table.Td>
									<Table.Td>{formatDuration(entry.duration)}</Table.Td>
								</Table.Tr>
							)
					)}
				</Table.Tbody>
			</Table>
			<SaveTimerModal
				show={showSaveModal}
				onClose={handleCloseSaveModal}
				initialData={
					selectedDraft
						? {
								draftId: selectedDraft.id,
								taskSelection: {
									boardId: selectedDraft.board_id || "",
									boardName: selectedDraft.board_name || "",
									itemId: selectedDraft.item_id || "",
									itemName: selectedDraft.item_name || "",
									parentItemId: selectedDraft.parent_item_id || undefined,
									parentItemName: selectedDraft.parent_item_name || undefined,
									roleId: selectedDraft.role_id || "",
									roleName: selectedDraft.role_name || "",
								},
								comment: selectedDraft.comment || "",
								date: new Date(selectedDraft.start_time),
								duration: formatDurationAsTime(selectedDraft.duration),
						  }
						: undefined
				}
			/>
			{editingEntry && <EditTimeEntryModal show={showEditModal} onClose={handleCloseEditModal} entry={editingEntry} onSaved={handleEditSaved} />}
			<DeleteConfirmationDialog show={showDeleteConfirmation} onConfirm={handleConfirmDelete} onCancel={handleCancelDelete} count={deleteCount} />
			<BulkActionButtons selectedIds={selectedIds} onBulkDelete={handleBulkDelete} onClearSelection={() => setSelectedIds([])} />
		</>
	);
}
