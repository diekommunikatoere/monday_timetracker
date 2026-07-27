// components/dashboard/EditTimeEntryModal.tsx
"use client";

import { Flex, Text, Group } from "@mantine/core";
import { useState, useEffect } from "react";

import { Button, Modal } from "@/components";
import { useToast } from "@/components/ToastProvider";
import { combineDateAndTime, durationToSeconds, secondsToDuration } from "@/lib/utils";
import { useMondayStore } from "@/stores/mondayStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useUserStore } from "@/stores/userStore";
import { TimeEntry } from "@/types/time-entry";

import { useRoles } from "../shared/hooks/useRoles";
import { useTimeEntryForm } from "../shared/hooks/useTimeEntryForm";
import { TimeEntryFormFields } from "../shared/time-entries/TimeEntryFormFields";
import TaskItemSelector, { TaskSelection } from "../TaskItemSelector";

import "@mantine/dates/styles.css";

/**
 * Props for {@link EditTimeEntryModal}.
 *
 * @property show     - Controls {@link Modal} visibility.
 * @property onClose  - Closes the modal (cancel / after a successful save).
 * @property entry    - The existing {@link TimeEntry} to edit; its fields seed the form when the modal opens.
 * @property onSaved  - Fired after a successful PATCH so the parent can refresh.
 */
interface EditTimeEntryModalProps {
	show: boolean;
	onClose: () => void;
	entry: TimeEntry;
	onSaved: () => void;
}

/**
 * Modal for editing an existing, finalized time entry.
 *
 * For parked (draft) entries, use {@link EditDraftEntryModal} instead — it
 * omits the task/role selectors, which a draft typically hasn't been assigned
 * yet (that happens at finalize time via {@link SaveTimerModal}).
 *
 * When `show` becomes true (or `entry.id` changes) it seeds {@link TimeEntryFormFields}
 * from `entry`: `start_time`/`end_time` (**ISO 8601**) are split into a date and
 * `HH:MM` time strings, and `duration` (**seconds**) is converted to `HH:MM` via
 * `secondsToDuration`. A {@link TaskItemSelector} is pre-filled from the entry's
 * board/item so the user can reassign the task; role is tracked separately via
 * a standalone `RoleSelector` (seeded from `entry.role_id`).
 *
 * On save it PATCHes `/api/time-entries/:id` with the new fields — `duration`
 * back to **seconds** via `durationToSeconds`, start/end combined into **ISO 8601**
 * — and sends `expectedUpdatedAt` (`entry.updated_at`) for optimistic-concurrency
 * control. A `409` response is surfaced as a conflict toast and the save is
 * aborted without closing; other errors set the inline error. On success it
 * `refetch`es `useTimeEntriesStore` for the current user, calls `onSaved`, and
 * closes.
 *
 * Reads from: `useTimeEntriesStore` (refetch), `useUserStore` (Supabase user),
 * `useMondayStore` (session token), `useToast`.
 *
 * @param props - Component props.
 * @returns A {@link Modal} titled "Zeiteintrag bearbeiten" with the form and update/cancel buttons.
 */
export default function EditTimeEntryModal({ show, onClose, entry, onSaved }: EditTimeEntryModalProps) {
	const [selectedTask, setSelectedTask] = useState<TaskSelection | null>(null);
	const [selectedRoleId, setSelectedRoleId] = useState<string>("");
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { values, anchor, durationLocked, handlers } = useTimeEntryForm({ initialAnchor: "none" });
	const { roles, isLoading: loadingRoles } = useRoles();

	const { refetch } = useTimeEntriesStore();
	const { showToast } = useToast();
	const userProfile = useUserStore((state) => state.supabaseUser);
	const { sessionToken } = useMondayStore();

	// Initialize form with entry data
	useEffect(() => {
		if (show && entry) {
			const start = new Date(entry.start_time);
			const end = new Date(entry.end_time);

			handlers.reset(
				{
					date: start,
					startTime: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
					endTime: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
					duration: secondsToDuration(entry.duration),
					comment: entry.comment || "",
				},
				"none",
				false,
			);

			setSelectedTask({
				boardId: entry.board_id || "",
				boardName: entry.board_name || "",
				itemId: entry.item_id || "",
				itemName: entry.item_name || "",
				parentItemId: entry.parent_item_id || undefined,
				parentItemName: entry.parent_item_name || undefined,
			});
			setSelectedRoleId(entry.role_id || "");
		}
	}, [show, entry?.id]); // Only re-run when modal opens or entry ID changes

	const handleSave = async () => {
		if (!selectedTask || !selectedRoleId || !userProfile?.id) {
			console.error("Cannot save: missing required data");
			setError("Bitte wähle eine Aufgabe und Rolle aus");
			return;
		}

		const durationSeconds = durationToSeconds(values.duration);
		if (durationSeconds === 0) {
			setError("Bitte gib eine Dauer an");
			return;
		}

		setIsSaving(true);
		setError(null);

		try {
			const startTimeIso = combineDateAndTime(values.date, values.startTime);
			const endTimeIso = combineDateAndTime(values.date, values.endTime);

			const response = await fetch(`/api/time-entries/${entry.id}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify({
					id: entry.id,
					comment: values.comment,
					board_id: selectedTask.boardId,
					item_id: selectedTask.itemId,
					role_id: selectedRoleId,
					duration: durationSeconds,
					start_time: startTimeIso,
					end_time: endTimeIso,
					expectedUpdatedAt: entry.updated_at,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				if (response.status === 409) {
					setError("Dieser Eintrag wurde von einem anderen Benutzer geändert.");
					showToast("Konflikt erkannt", "negative", 3000);
					return;
				}
				throw new Error(errorData.error || "Failed to update time entry");
			}

			showToast("Zeiteintrag aktualisiert", "positive", 2000);
			refetch(userProfile.id);
			onSaved();
			onClose();
		} catch (err: any) {
			setError(err.message || "Fehler beim Aktualisieren");
			showToast("Fehler beim Aktualisieren", "negative", 2000);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Modal show={show} onClose={onClose} size={"lg"}>
			<Modal.Header>Zeiteintrag bearbeiten</Modal.Header>
			<Modal.Body>
				<Flex direction="column" gap="md">
					{error && <Text c="red">{error}</Text>}

					<TimeEntryFormFields
						date={values.date}
						onDateChange={handlers.setDate}
						duration={values.duration}
						onDurationChange={handlers.handleDurationChange}
						startTime={values.startTime}
						onStartTimeChange={handlers.handleStartTimeChange}
						endTime={values.endTime}
						onEndTimeChange={handlers.handleEndTimeChange}
						comment={values.comment}
						onCommentChange={handlers.setComment}
						startLocked={anchor === "start"}
						endLocked={anchor === "end"}
						durationLocked={durationLocked}
						onStartLockToggle={handlers.toggleStartLock}
						onEndLockToggle={handlers.toggleEndLock}
						onDurationLockToggle={handlers.toggleDurationLock}
						onStartTimeNowClick={handlers.handleStartTimeNow}
						onEndTimeNowClick={handlers.handleEndTimeNow}
						quickAdjustments={{
							add: [
								{ label: "+15m", minutes: 15 },
								{ label: "+30m", minutes: 30 },
								{ label: "+1h", minutes: 60 },
								{ label: "+2h", minutes: 120 },
							],
							subtract: [
								{ label: "-15m", minutes: -15 },
								{ label: "-1h", minutes: -60 },
							],
							onAdjust: handlers.adjustDuration,
						}}
						taskSelector={{
							show: true,
							node: (
								<TaskItemSelector
									onSelectionChange={setSelectedTask}
									initialValues={
										selectedTask
											? {
													boardId: selectedTask.boardId,
													boardName: selectedTask.boardName,
													itemId: selectedTask.itemId,
													itemName: selectedTask.itemName,
												}
											: undefined
									}
								/>
							),
						}}
						roleSelector={{
							show: true,
							roles,
							selectedRoleId,
							onRoleChange: setSelectedRoleId,
							loading: loadingRoles,
							required: true,
						}}
					/>

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={onClose}>
							Abbrechen
						</Button>
						<Button onClick={handleSave} disabled={!selectedTask?.itemId || !selectedTask?.boardId || !selectedRoleId || isSaving} loading={isSaving}>
							Aktualisieren
						</Button>
					</Group>
				</Flex>
			</Modal.Body>
		</Modal>
	);
}
