// components/dashboard/SaveTimerModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Flex, Text, Group } from "@mantine/core";
import { Button, Modal } from "@/components";
import TaskItemSelector, { TaskSelection } from "../TaskItemSelector";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import { TimeEntryFormFields } from "../shared/time-entries/TimeEntryFormFields";
import { useTimeEntryForm } from "../shared/hooks/useTimeEntryForm";
import { roundDuration, combineDateAndTime, durationToSeconds, secondsToDuration, getCurrentTimeString, subtractSecondsFromTimeString } from "@/lib/utils";

import "@mantine/dates/styles.css";
import "@/public/css/components/SaveTimerModal.css";

/**
 * Optional seed data for {@link SaveTimerModal} when reopening a saved draft.
 *
 * When omitted the modal reads live state from `useTimerStore` instead.
 *
 * @property entryId       - Entry id to finalize (falls back to the live timer's `entryId`).
 * @property taskSelection - Pre-selected board/item/role ({@link TaskSelection}).
 * @property comment       - Pre-filled comment.
 * @property date          - Entry date.
 * @property duration      - `HH:MM` duration string.
 * @property startTime     - `HH:MM` start-of-day time string.
 * @property endTime       - `HH:MM` end-of-day time string.
 */
interface SaveTimerModalProps {
	show: boolean;
	onClose: () => void;
	initialData?: {
		entryId?: string;
		taskSelection?: TaskSelection;
		comment?: string;
		date?: Date;
		duration?: string;
		startTime?: string;
		endTime?: string;
	};
}

/**
 * Modal that finalizes a running timer (or a saved draft) into a persisted time
 * entry.
 *
 * Time/duration/lock state is driven by the shared {@link useTimeEntryForm} hook
 * and rendered via {@link TimeEntryFormFields} (start/end/duration locks, "now"
 * buttons, quick-adjust). The comment is **not** taken from the hook: it stays
 * special so the live-timer path stays bound to `useTimerStore.comment` while the
 * reopened-draft path uses local state.
 *
 * **Two modes (set on open via `handlers.reset`):**
 * - With `initialData` (reopening a draft from the entries table): if the draft
 *   has stored start/end times they are shown free (`anchor = "none"`) so the
 *   historical window is preserved; without stored times it opens end-locked at
 *   "now".
 * - Without `initialData` (live timer): the duration is snapshotted once from
 *   the paused timer's elapsed milliseconds (`useTimerStore.elapsedTime`, to
 *   seconds and rounded), the end defaults to "now" (`anchor = "end"`), and after
 *   a successful finalize it calls `resetTimer()` to clear the live timer's local
 *   state.
 *
 * Both modes finalize through `POST /api/timer/finalize` (the atomic
 * `timer_finalize` RPC) — it closes the open segment and flips `timer_state` to
 * `finalized` in one transaction, so there is no separate soft-reset call.
 *
 * On save the end time is *derived* from `start + duration` (in **seconds**) to
 * guarantee it never inverts and crosses midnight correctly; `duration` is sent
 * to the API in **seconds** and start/end as full **ISO 8601** timestamps.
 * Authenticates with the bearer `sessionToken` from `useMondayStore`.
 *
 * Reads from: `useTimerStore`, `useUserStore`, `useTimeEntriesStore` (refetch),
 * `useMondayStore`, `useToast`.
 *
 * @param props - Component props.
 * @returns A {@link Modal} titled "Zeiteintrag speichern" with the shared time-entry form, a {@link TaskItemSelector}, and save/cancel buttons.
 */
export default function SaveTimerModal({ show, onClose, initialData }: SaveTimerModalProps) {
	const [selectedTask, setSelectedTask] = useState<TaskSelection | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Local comment state - used when modal is opened with initialData
	const [localComment, setLocalComment] = useState<string>("");

	const { values, anchor, durationLocked, handlers } = useTimeEntryForm({ initialAnchor: "end" });

	// Store selectors
	const { refetch } = useTimeEntriesStore();
	const { sessionToken } = useMondayStore();
	const { showToast } = useToast();
	const userProfile = useUserStore((state) => state.supabaseUser);

	// Timer store — a live timer is a non-finalized time_entry, tracked by entryId.
	const globalComment = useTimerStore((state) => state.comment);
	const entryId = useTimerStore((state) => state.entryId);

	// Store actions
	const { setComment: setGlobalComment, reset: resetTimer } = useTimerStore.getState();

	// Use local comment when initialData is provided, otherwise use global comment (with its auto-save)
	const comment = initialData ? localComment : globalComment;
	const setComment = initialData ? setLocalComment : setGlobalComment;

	// Initialize the form when the modal opens (live timer vs reopened draft).
	useEffect(() => {
		if (!show) return;
		setError(null);

		if (initialData) {
			setSelectedTask(initialData.taskSelection || null);
			setLocalComment(initialData.comment || "");
			const date = initialData.date || new Date();
			const draftComment = initialData.comment || "";

			if (initialData.startTime && initialData.endTime) {
				// Reopened draft with stored times: preserve them, open free (no anchor, no tick).
				handlers.reset({ date, duration: initialData.duration || "00:00", startTime: initialData.startTime, endTime: initialData.endTime, comment: draftComment }, "none", false);
			} else {
				// Reopened draft without stored times: end at "now", end-locked.
				const now = getCurrentTimeString();
				const durationStr = initialData.duration || "00:00";
				const start = subtractSecondsFromTimeString(now, durationToSeconds(durationStr));
				handlers.reset({ date, duration: durationStr, startTime: start, endTime: now, comment: draftComment }, "end", false);
			}
		} else {
			// Live timer: snapshot the (paused) elapsed time, end at "now", end-locked.
			setSelectedTask(null);
			setLocalComment("");
			const roundedSeconds = roundDuration(Math.floor(useTimerStore.getState().elapsedTime / 1000));
			const now = getCurrentTimeString();
			const start = subtractSecondsFromTimeString(now, roundedSeconds);
			handlers.reset({ date: new Date(), duration: secondsToDuration(roundedSeconds), startTime: start, endTime: now, comment: "" }, "end", false);
		}
	}, [show, initialData]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleSave = async () => {
		// Reopening a draft (initialData) finalizes that entry; otherwise finalize the live timer.
		const activeEntryId = initialData?.entryId || entryId;

		if (!activeEntryId || !selectedTask || !userProfile?.id || !selectedTask.roleId) {
			console.error("Cannot save: missing required data", { entryId: activeEntryId, selectedTask, userId: userProfile?.id });
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
			// Use actual task name from selection, with fallback
			const taskName = selectedTask.itemName || "Unbenannter Zeit-Eintrag";

			// Build full ISO date-time strings from date + time inputs.
			// Derive the end from start + duration so it can never invert and crosses midnight correctly.
			const startTimeIso = combineDateAndTime(values.date, values.startTime);
			const endTimeIso = new Date(new Date(startTimeIso).getTime() + durationSeconds * 1000).toISOString();

			// Finalize via the atomic timer_finalize RPC. It closes the open segment, sets
			// duration/start/end + assignment columns, and flips timer_state to 'finalized'
			// in one transaction — no separate soft-reset/session cleanup needed.
			const response = await fetch("/api/timer/finalize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
				body: JSON.stringify({
					entryId: activeEntryId,
					taskName,
					comment,
					boardId: selectedTask.boardId,
					boardName: selectedTask.boardName,
					itemId: selectedTask.itemId,
					itemName: selectedTask.itemName,
					parentItemId: selectedTask.parentItemId || null,
					parentItemName: selectedTask.parentItemName || null,
					roleId: selectedTask.roleId,
					duration: durationSeconds,
					startTime: startTimeIso,
					endTime: endTimeIso,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to save time entry");
			}

			showToast("Zeiteintrag gespeichert.", "positive", 2000);

			// Only clear the live timer when saving it directly (no initialData). When initialData
			// is present we are finalizing a draft row from the entries table, not the live timer.
			if (!initialData) {
				resetTimer();
			}

			// Refetch time entries to show the new one
			refetch(userProfile.id);

			onClose();
		} catch (err: any) {
			console.error("Error saving time entry:", err);
			setError(err.message || "Fehler beim Speichern des Zeiteintrags");
			showToast("Fehler beim Speichern", "negative", 2000);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Modal show={show} onClose={onClose} size={"lg"}>
			<Modal.Header>Zeiteintrag speichern</Modal.Header>
			<Modal.Body>
				<Flex direction="column" gap="md">
					{error && <Text c="dki-error">{error}</Text>}

					<TimeEntryFormFields
						date={values.date}
						onDateChange={handlers.setDate}
						duration={values.duration}
						onDurationChange={handlers.handleDurationChange}
						startTime={values.startTime}
						onStartTimeChange={handlers.handleStartTimeChange}
						endTime={values.endTime}
						onEndTimeChange={handlers.handleEndTimeChange}
						comment={comment}
						onCommentChange={setComment}
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
													roleId: selectedTask.roleId,
													roleName: selectedTask.roleName,
												}
											: undefined
									}
								/>
							),
						}}
					/>

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={onClose}>
							Abbrechen
						</Button>
						<Button onClick={handleSave} disabled={!selectedTask?.itemId || !selectedTask?.boardId || !selectedTask?.roleId || isSaving} loading={isSaving}>
							{isSaving ? "Speichern..." : "Speichern"}
						</Button>
					</Group>
				</Flex>
			</Modal.Body>
		</Modal>
	);
}
