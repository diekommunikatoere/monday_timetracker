// components/dashboard/EditDraftEntryModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Flex, Text, Group } from "@mantine/core";
import { Button, Modal } from "@/components";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useToast } from "@/components/ToastProvider";
import { TimeEntry } from "@/types/time-entry";
import { combineDateAndTime, durationToSeconds, secondsToDuration } from "@/lib/utils";
import { TimeEntryFormFields } from "../shared/time-entries/TimeEntryFormFields";
import { useTimeEntryForm } from "../shared/hooks/useTimeEntryForm";

import "@mantine/dates/styles.css";

/**
 * Props for {@link EditDraftEntryModal}.
 *
 * @property show     - Controls {@link Modal} visibility.
 * @property onClose  - Closes the modal (cancel / after a successful save).
 * @property entry    - The existing **parked** (`timer_state === "parked"`) {@link TimeEntry} to edit; its fields seed the form when the modal opens.
 * @property onSaved  - Fired after a successful PATCH so the parent can refresh.
 */
interface EditDraftEntryModalProps {
	show: boolean;
	onClose: () => void;
	entry: TimeEntry;
	onSaved: () => void;
}

/**
 * Reduced edit modal for a **parked** (`timer_state === "parked"`) time entry
 * — time fields + comment only.
 *
 * Only valid for `parked` entries, not `paused`/`running` ones: a parked
 * timer's segments are already closed and its `duration`/`start_time`/
 * `end_time` snapshotted (by `timer_park`), so a plain field PATCH is stable.
 * A `paused` entry is still live — its `duration`/`end_time` stay `NULL`
 * until `timer_park`/`timer_finalize` recomputes them from segments — so
 * editing those columns directly would seed garbage and be silently
 * overwritten on the next timer transition; {@link TimeEntryRowMenu} does not
 * offer "Bearbeiten" for `paused` rows for this reason.
 *
 * A parked draft also usually has no board/item/role selected yet, so unlike
 * {@link EditTimeEntryModal} this form omits the task/role selectors entirely;
 * a user who wants to assign a task/role finalizes the draft via "Speichern"
 * ({@link SaveTimerModal}) instead. Edits here are a plain field PATCH that
 * never touches `entry.timer_state`, so the entry stays parked.
 *
 * Seeding and save/conflict handling mirror {@link EditTimeEntryModal}: on
 * open it splits `start_time`/`end_time` (ISO 8601) into a date + `HH:MM`
 * strings and converts `duration` (seconds) via `secondsToDuration`. On save
 * it PATCHes `/api/time-entries/:id` with `comment`, `duration` (back to
 * seconds), `start_time`/`end_time` (recombined to ISO 8601), and
 * `expectedUpdatedAt` (`entry.updated_at`) for optimistic-concurrency control
 * — no `board_id`/`item_id`/`role_id` are sent. A `409` response is surfaced
 * as a conflict toast and the save is aborted without closing; other errors
 * set the inline error. On success it `refetch`es `useTimeEntriesStore` for
 * the current user, calls `onSaved`, and closes.
 *
 * Reads from: `useTimeEntriesStore` (refetch), `useUserStore` (Supabase user),
 * `useMondayStore` (session token), `useToast`.
 *
 * @param props - Component props.
 * @returns A {@link Modal} titled "Entwurf bearbeiten" with the reduced form and update/cancel buttons.
 */
export default function EditDraftEntryModal({ show, onClose, entry, onSaved }: EditDraftEntryModalProps) {
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { values, anchor, durationLocked, handlers } = useTimeEntryForm({ initialAnchor: "none" });

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
		}
	}, [show, entry?.id]); // Only re-run when modal opens or entry ID changes

	const handleSave = async () => {
		if (!userProfile?.id) {
			console.error("Cannot save: missing user profile");
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
			<Modal.Header>Entwurf bearbeiten</Modal.Header>
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
					/>

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={onClose}>
							Abbrechen
						</Button>
						<Button onClick={handleSave} disabled={isSaving} loading={isSaving}>
							Aktualisieren
						</Button>
					</Group>
				</Flex>
			</Modal.Body>
		</Modal>
	);
}
