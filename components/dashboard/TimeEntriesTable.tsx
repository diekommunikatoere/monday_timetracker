// components/dashboard/TimeEntriesTable.tsx
"use client";

import { useState, useCallback } from "react";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import { TimeEntry } from "@/types/time-entry";
import { secondsToDuration } from "@/lib/utils";
import SaveTimerModal from "./SaveTimerModal";
import EditTimeEntryModal from "./EditTimeEntryModal";
import BulkActionButtons from "./BulkActionButtons";
import DeleteConfirmationDialog from "../shared/time-entries/DeleteConfirmationDialog";
import { TimeEntryTable } from "../shared/time-entries/TimeEntryTable";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

interface TimeEntriesTableProps {
	timeEntries?: TimeEntry[];
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

	const userId = useUserStore((state) => state.supabaseUser?.id);
	const { rawContext } = useMondayStore();
	const { showToast } = useToast();

	const handleSelectAll = (checked: boolean) => {
		if (checked) {
			setSelectedIds(timeEntries.map((entry) => entry.id));
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
		if (entry.is_draft) {
			handleOpenSaveModal(entry);
		} else {
			setEditingEntry(entry);
			setShowEditModal(true);
		}
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
					onAction: () => handleUndo(entry.id, undoToken),
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

	return (
		<>
			<TimeEntryTable timeEntries={timeEntries} loading={loading} error={error} selectedIds={selectedIds} onSelectRow={handleRowSelect} onSelectAll={handleSelectAll} onEdit={handleEdit} onDelete={handleDelete} currentUserId={userId} showCheckbox={true} />

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
								duration: secondsToDuration(selectedDraft.duration),
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
