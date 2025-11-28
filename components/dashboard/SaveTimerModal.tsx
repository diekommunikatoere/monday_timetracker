// components/dashboard/SaveTimerModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Flex, Text, TextInput, Modal, Button, Group } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { TimePicker } from "@mantine/dates";
import { formatTime } from "@/lib/utils";
import TaskItemSelector, { TaskSelection } from "../TaskItemSelector";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import mondaySdk from "monday-sdk-js";
import Calendar from "@/components/icons/Calendar";

import "@mantine/dates/styles.css";

const monday = mondaySdk();

interface SaveTimerModalProps {
	show: boolean;
	onClose: () => void;
}

/**
 * SaveTimerModal - Modal for saving a timer session to a time entry
 *
 * This component allows the user to:
 * - View and adjust the duration with quick buttons
 * - Select a date for the time entry
 * - Select a task/item to associate the time entry with
 * - Add/edit a comment
 * - Save the time entry
 */
export default function SaveTimerModal({ show, onClose }: SaveTimerModalProps) {
	const [selectedTask, setSelectedTask] = useState<TaskSelection | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [date, setDate] = useState<Date>(new Date());
	const [duration, setDuration] = useState("00:00");

	// Store selectors
	const { refetch } = useTimeEntriesStore();
	const { rawContext } = useMondayStore();
	const { showToast } = useToast();
	const userProfile = useUserStore((state) => state.supabaseUser);

	// Timer store - using new API
	const comment = useTimerStore((state) => state.comment);
	const elapsedTime = useTimerStore((state) => state.elapsedTime);
	const draftId = useTimerStore((state) => state.draftId);
	const sessionId = useTimerStore((state) => state.sessionId);

	// Store actions
	const { setComment, reset: resetTimer } = useTimerStore.getState();

	// Convert HH:MM to seconds
	const durationToSeconds = (timeStr: string): number => {
		console.log(timeStr);
		const [hours, minutes] = timeStr.split(":").map(Number);
		return (hours || 0) * 3600 + (minutes || 0) * 60;
	};

	// Convert seconds to HH:MM
	const formatDurationFromMs = (ms: number): string => {
		console.log(ms);
		const hours = Math.floor(ms / 1000 / 3600);
		const minutes = Math.floor(((ms / 1000) % 3600) / 60);
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
	};

	// Adjust duration by minutes
	const adjustDuration = (minutesToAdd: number) => {
		const currentSeconds = durationToSeconds(duration);
		const newSeconds = Math.max(0, currentSeconds + minutesToAdd * 60);
		setDuration(formatDurationFromMs(newSeconds * 1000));
	};

	// Clear error state and selection when modal opens, sync duration with elapsed time
	useEffect(() => {
		if (show) {
			setError(null);
			setSelectedTask(null);
			setDate(new Date());
			setDuration(formatDurationFromMs(elapsedTime));
		}
	}, [show, elapsedTime]);

	const handleTaskSelection = (taskData: TaskSelection) => {
		setSelectedTask(taskData);
	};

	const handleSave = async () => {
		if (!draftId || !selectedTask || !userProfile?.id) {
			console.error("Cannot save: missing required data", { draftId, selectedTask, userId: userProfile?.id });
			return;
		}

		const durationSeconds = durationToSeconds(duration);
		if (durationSeconds === 0) {
			setError("Bitte geben Sie eine Dauer ein");
			return;
		}

		setIsSaving(true);
		setError(null);

		try {
			// Use actual task name from selection, with fallback
			const taskName = selectedTask.itemName || "Unbenannter Zeit-Eintrag";

			// Get fresh context for the API call
			const context = rawContext || (await monday.get("context"));

			// Call API route to finalize time entry
			const response = await fetch("/api/time-entries/finalize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"monday-context": JSON.stringify(context),
				},
				body: JSON.stringify({
					draftId,
					taskName,
					comment,
					boardId: selectedTask.boardId,
					boardName: selectedTask.boardName,
					itemId: selectedTask.itemId,
					itemName: selectedTask.itemName,
					parentItemId: selectedTask.parentItemId,
					parentItemName: selectedTask.parentItemName,
					role: selectedTask.role,
					roleName: selectedTask.roleName,
					duration: durationSeconds,
					date: date.toISOString(),
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to save time entry");
			}

			showToast("Zeiteintrag gespeichert.", "positive", 2000);

			// Soft reset timer via API (keeps time entry but clears session)
			if (sessionId) {
				await fetch("/api/timer/soft-reset", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"monday-context": JSON.stringify(context),
					},
					body: JSON.stringify({
						draftId,
						sessionId,
					}),
				});
			}

			// Reset local timer state
			resetTimer();

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

	const handleCommentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setComment(event.currentTarget.value);
	};

	const handleDateChange = (val: Date | string | null) => {
		if (!val) return;
		if (val instanceof Date) {
			setDate(val);
		} else if (typeof val === "string") {
			// Parse DD.MM.YYYY
			const [day, month, year] = val.split(".").map(Number);
			if (day && month && year) {
				setDate(new Date(year, month - 1, day));
			}
		}
	};

	return (
		<Modal opened={show} onClose={onClose} title="Timer speichern" size="lg">
			<Flex direction="column" gap="md">
				{error && <Text c="dki-error">{error}</Text>}

				<Flex gap="md" direction="column">
					<Flex gap="sm">
						<TimePicker label="Dauer" withAsterisk value={duration} onChange={(value) => setDuration(value)} clearable style={{ flex: 2 }} />
						<DatePickerInput label="Datum" placeholder="Datum auswählen" value={date} onChange={handleDateChange} valueFormat="DD.MM.YYYY" leftSection={<Calendar size="16" fillColor="var(--color--tertiary)" />} leftSectionPointerEvents="none" style={{ flex: 1 }} />
					</Flex>
					<Flex gap="sm">
						<Flex align="center" flex={2}>
							<Button size="sm" variant="default" style={{ flex: 1, borderRadius: "5px 0 0 5px" }} onClick={() => adjustDuration(15)}>
								+15m
							</Button>
							<Button size="sm" variant="default" style={{ flex: 1, borderRadius: "0" }} onClick={() => adjustDuration(30)}>
								+30m
							</Button>
							<Button size="sm" variant="default" style={{ flex: 1, borderRadius: "0" }} onClick={() => adjustDuration(60)}>
								+1h
							</Button>
							<Button size="sm" variant="default" style={{ flex: 1, borderRadius: "0 5px 5px 0" }} onClick={() => adjustDuration(120)}>
								+2h
							</Button>
						</Flex>
						<Flex align="center" flex={1}>
							<Button size="sm" variant="default" style={{ flex: 1, borderRadius: "5px 0 0 5px" }} onClick={() => adjustDuration(-15)}>
								-15m
							</Button>
							<Button size="sm" variant="default" style={{ flex: 1, borderRadius: "0 5px 5px 0" }} onClick={() => adjustDuration(-60)}>
								-1h
							</Button>
						</Flex>
					</Flex>
				</Flex>

				<TaskItemSelector onSelectionChange={handleTaskSelection} />

				<TextInput aria-label="Kommentar hinzufügen..." value={comment} onChange={handleCommentChange} placeholder="Kommentar hinzufügen..." label="Kommentar" />

				<Group justify="flex-end" mt="md">
					<Button variant="default" onClick={onClose}>
						Abbrechen
					</Button>
					<Button onClick={handleSave} disabled={!selectedTask?.itemId || isSaving} loading={isSaving}>
						{isSaving ? "Speichern..." : "Speichern"}
					</Button>
				</Group>
			</Flex>
		</Modal>
	);
}
