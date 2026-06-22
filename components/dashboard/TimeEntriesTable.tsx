// components/dashboard/TimeEntriesTable.tsx
"use client";

import { useState } from "react";
import { Flex } from "@mantine/core";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import { TimeEntry } from "@/types/time-entry";
import { secondsToDuration, formatTimeString } from "@/lib/utils";
import SaveTimerModal from "./SaveTimerModal";
import EditTimeEntryModal from "./EditTimeEntryModal";
import BulkActionButtons from "./BulkActionButtons";
import DeleteConfirmationDialog from "../shared/time-entries/DeleteConfirmationDialog";
import { TimeEntryTable } from "../shared/time-entries/TimeEntryTable";
import { getDashboardColumns } from "../shared/time-entries/TimeEntryTableConfigs";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

/**
 * Props for {@link TimeEntriesTable}.
 *
 * **Gotcha:** only `onRefetch` is actually consumed. `timeEntries`, `loading`,
 * and `error` are declared here but the component reads the live values from
 * `useTimeEntriesStore()` instead — the props are effectively unused/overridden.
 *
 * @property timeEntries - Declared but unused; the table reads entries from `useTimeEntriesStore`.
 * @property loading     - Declared but unused; the table reads loading state from `useTimeEntriesStore`.
 * @property error       - Declared but unused; the table reads errors from `useTimeEntriesStore`.
 * @property onRefetch   - Called after any mutation (edit/delete/undo/finalize) to refresh the list.
 */
interface TimeEntriesTableProps {
	timeEntries?: TimeEntry[];
	loading?: boolean;
	error?: string | null;
	onRefetch: () => void;
}

/**
 * Dashboard time-entries table with inline edit, delete (with undo), and bulk
 * actions.
 *
 * Renders the shared {@link TimeEntryTable} using {@link getDashboardColumns};
 * row selection is limited to the current user's own entries (`userId` from
 * `useUserStore`). Editing is dispatched by entry type: **drafts**
 * (`entry.is_draft`) open {@link SaveTimerModal} seeded from the draft row,
 * while finalized entries open {@link EditTimeEntryModal}. Both "edit" and
 * "finalize draft" funnel through `onEdit`.
 *
 * Single-row delete hits `DELETE /api/time-entries/:id` and surfaces a toast
 * with a "Rückgängig" action that calls `POST /api/time-entries/:id/undo` using
 * the `undoToken` returned by the delete. Bulk delete POSTs the selected ids to
 * `/api/time-entries/bulk-delete`. Both are gated by a
 * {@link DeleteConfirmationDialog}. {@link BulkActionButtons} is rendered
 * alongside to drive bulk delete and selection clearing.
 *
 * Reads from: `useTimeEntriesStore`, `useUserStore`, `useMondayStore`
 * (session token), `useToast`.
 *
 * @param props - Component props (only `onRefetch` is used; see the prop docs).
 * @returns The table plus its modals, delete dialog, and bulk-action panel.
 */
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
	const { rawContext, sessionToken } = useMondayStore();
	const { showToast } = useToast();

	const handleSelectAll = (checked: boolean) => {
		if (checked) {
			const ownEntryIds = timeEntries.filter((entry) => entry.user_id === userId).map((entry) => entry.id);
			setSelectedIds(ownEntryIds);
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
						Authorization: `Bearer ${sessionToken}`,
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
						Authorization: `Bearer ${sessionToken}`,
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
					Authorization: `Bearer ${sessionToken}`,
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

	const columns = getDashboardColumns({
		onEdit: handleEdit,
		onDelete: handleDelete,
		onSelectRow: handleRowSelect,
		onSelectAll: handleSelectAll,
		selectedIds,
		currentUserId: userId,
	});

	return (
		<>
			<Flex direction="column" gap="md" style={{ flex: 1, minHeight: 0, width: "100%" }}>
				<TimeEntryTable timeEntries={timeEntries} columns={columns} loading={loading} error={error} selectedIds={selectedIds} scrollable />
			</Flex>

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
								startTime: formatTimeString(new Date(selectedDraft.start_time)),
								endTime: formatTimeString(new Date(selectedDraft.end_time)),
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
