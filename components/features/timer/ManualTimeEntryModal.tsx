// components/features/timer/ManualTimeEntryModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Group, Flex, Text } from "@mantine/core";
import { Button, Modal } from "@/components";
import TaskItemSelector, { TaskSelection } from "@/components/TaskItemSelector";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import { combineDateAndTime, durationToSeconds, getCurrentTimeString } from "@/lib/utils";
import { TimeEntryFormFields } from "../../shared/time-entries/TimeEntryFormFields";
import { useTimeEntryForm } from "../../shared/hooks/useTimeEntryForm";
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

	const { values, anchor, durationLocked, handlers } = useTimeEntryForm({ initialAnchor: "end" });

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
			setError(null);
		}
	}, [show]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleSave = async () => {
		if (!selectedTask?.itemId || !selectedTask?.boardId || !selectedTask?.roleId || !userProfile?.id) {
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
					taskName: selectedTask.itemName,
					comment: values.comment,
					boardId: selectedTask.boardId,
					boardName: selectedTask.boardName,
					itemId: selectedTask.itemId,
					itemName: selectedTask.itemName,
					parentItemId: selectedTask.parentItemId,
					parentItemName: selectedTask.parentItemName,
					roleId: selectedTask.roleId,
					duration: durationSeconds,
					date: values.date.toISOString(),
					startTime: startTimeIso,
					endTime: endTimeIso,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to save time entry");
			}

			showToast("Zeiteintrag gespeichert.", "positive", 2000);
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
						taskSelector={{
							show: true,
							node: <TaskItemSelector onSelectionChange={setSelectedTask} subItemsOnly={true} />,
						}}
					/>

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={onClose}>
							Abbrechen
						</Button>
						<Button onClick={handleSave} disabled={!selectedTask?.itemId || !selectedTask?.boardId || !selectedTask?.roleId || isSaving} loading={isSaving}>
							Speichern
						</Button>
					</Group>
				</Flex>
			</Modal.Body>
		</Modal>
	);
}

export default ManualTimeEntryModal;
