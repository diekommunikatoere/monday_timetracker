// components/features/timer/ManualTimeEntryModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Group, Flex, Text, Switch } from "@mantine/core";
import { Button, Modal } from "@/components";
import TaskItemSelector, { TaskSelection } from "@/components/TaskItemSelector";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import { combineDateAndTime, durationToSeconds, getCurrentTimeString } from "@/lib/utils";
import { TimeEntryFormFields } from "../../shared/time-entries/TimeEntryFormFields";
import { useTimeEntryForm } from "../../shared/hooks/useTimeEntryForm";
import { useRoles } from "../../shared/hooks/useRoles";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

/**
 * Props for {@link ManualTimeEntryModal}.
 *
 * @property show    - When `true`, the modal is rendered open; toggling to
 *                     `false` triggers the close transition.
 * @property onClose - Called when the user dismisses the modal (cancel button,
 *                     backdrop, or after a successful save).
 */
interface ManualTimeEntryModalProps {
	show: boolean;
	onClose: () => void;
}

/**
 * `ManualTimeEntryModal` — modal for entering a completed time entry by hand
 * (no running timer session required).
 *
 * Wraps the shared {@link TimeEntryFormFields} driven by {@link useTimeEntryForm},
 * and adds a `TaskItemSelector` (sub-items only) so the user picks a monday.com
 * task to attach the entry to. On save it POSTs to `/api/time-entries/manual`
 * with the monday `rawContext` (falling back to `monday.get("context")`) in the
 * `monday-context` header and the `sessionToken` as a Bearer token.
 *
 * **"Als Entwurf speichern" toggle:** switches the modal into draft mode, which
 * swaps the `TaskItemSelector` (board/task/role) for a standalone role `Select`
 * (via {@link useRoles}) and relaxes validation to only require a duration — no
 * board/task, and role is optional. The request is sent with `asDraft: true`,
 * which the API inserts as a `parked` row (skipping the monday column sync).
 *

 * **Units:** the on-screen `duration` is an `"HH:MM"` string; it is converted to
 * **seconds** via {@link durationToSeconds} before being sent as `duration`.
 * `startTime`/`endTime` are combined with the date via {@link combineDateAndTime}
 * into ISO timestamps. The `date` is sent as a full ISO string.
 *
 * The form is reset every time the modal opens (see the `useEffect` on `show`).
 * Errors from a missing task, a zero duration, or a failed API call are surfaced
 * inline in red text. After a successful save it shows a toast, refetches the
 * user's time entries through `useTimeEntriesStore`, and calls `onClose`.
 *
 * @param props.show    - Whether the modal is open.
 * @param props.onClose - Close handler invoked on dismiss / successful save.
 * @returns A `Modal` containing the manual entry form and save/cancel actions.
 */

export function ManualTimeEntryModal({ show, onClose }: ManualTimeEntryModalProps) {
	const [selectedTask, setSelectedTask] = useState<TaskSelection | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [asDraft, setAsDraft] = useState(false);
	const [selectedRoleId, setSelectedRoleId] = useState<string>("");

	const { values, anchor, durationLocked, handlers } = useTimeEntryForm({ initialAnchor: "end" });
	const { roles, isLoading: loadingRoles } = useRoles();

	const { refetch } = useTimeEntriesStore();
	const { rawContext, sessionToken } = useMondayStore();
	const { showToast } = useToast();
	const userProfile = useUserStore((state) => state.supabaseUser);

	// Reset form when modal opens: default end-locked at "now" with zero duration.
	useEffect(() => {
		if (show) {
			const now = getCurrentTimeString();
			handlers.reset({ date: new Date(), duration: "00:00", startTime: now, endTime: now, comment: "" }, "end", false);
			setSelectedTask(null);
			setAsDraft(false);
			setSelectedRoleId("");
			setError(null);
		}
	}, [show]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleSave = async () => {
		if (!userProfile?.id) {
			console.error("Cannot save: missing user profile");
			setError("Bitte wähle eine Aufgabe und Rolle aus");
			return;
		}

		// A draft only needs a duration; a finalized entry still needs a task + role.
		if (!asDraft && (!selectedTask?.itemId || !selectedTask?.boardId || !selectedTask?.roleId)) {
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
			const context = rawContext || (await monday.get("context"));
			const startTimeIso = combineDateAndTime(values.date, values.startTime);
			const endTimeIso = combineDateAndTime(values.date, values.endTime);

			const response = await fetch("/api/time-entries/manual", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"monday-context": JSON.stringify(context),
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify({
					userId: userProfile.id,
					taskName: asDraft ? undefined : selectedTask?.itemName,
					comment: values.comment,
					boardId: asDraft ? undefined : selectedTask?.boardId,
					boardName: asDraft ? undefined : selectedTask?.boardName,
					itemId: asDraft ? undefined : selectedTask?.itemId,
					itemName: asDraft ? undefined : selectedTask?.itemName,
					parentItemId: asDraft ? undefined : selectedTask?.parentItemId,
					parentItemName: asDraft ? undefined : selectedTask?.parentItemName,
					roleId: asDraft ? selectedRoleId || undefined : selectedTask?.roleId,
					duration: durationSeconds,
					date: values.date.toISOString(),
					startTime: startTimeIso,
					endTime: endTimeIso,
					asDraft,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to save time entry");
			}

			showToast(asDraft ? "Entwurf gespeichert." : "Zeiteintrag gespeichert.", "positive", 2000);
			refetch(userProfile.id);
			onClose();
		} catch (err: any) {
			setError(err.message || "Fehler beim Speichern");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Modal show={show} onClose={onClose} size={"lg"}>
			<Modal.Header>Zeit eintragen</Modal.Header>
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
						taskSelector={
							asDraft
								? undefined
								: {
										show: true,
										node: <TaskItemSelector onSelectionChange={setSelectedTask} subItemsOnly={true} />,
									}
						}
						roleSelector={
							asDraft
								? {
										show: true,
										roles,
										selectedRoleId,
										onRoleChange: setSelectedRoleId,
										loading: loadingRoles,
									}
								: undefined
						}
					/>

					<Flex justify="space-between" align="center" gap="sm" wrap="wrap" mt="md">
						<Switch label="Als Entwurf speichern" checked={asDraft} onChange={(event) => setAsDraft(event.currentTarget.checked)} />
						<Group justify="flex-end">
							<Button variant="default" onClick={onClose}>
								Abbrechen
							</Button>
							<Button onClick={handleSave} disabled={(!asDraft && (!selectedTask?.itemId || !selectedTask?.boardId || !selectedTask?.roleId)) || isSaving} loading={isSaving}>
								Speichern
							</Button>
						</Group>
					</Flex>
				</Flex>
			</Modal.Body>
		</Modal>
	);
}

export default ManualTimeEntryModal;
