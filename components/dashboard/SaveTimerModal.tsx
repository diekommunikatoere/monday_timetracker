// components/dashboard/SaveTimerModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Flex, Text, TextInput, Group } from "@mantine/core";
import { Button, ButtonGroup, Modal } from "@/components";
import { DatePicker, TimePicker } from "@/components";
import TaskItemSelector, { TaskSelection } from "../TaskItemSelector";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import mondaySdk from "monday-sdk-js";
import { Icon } from "@/components";

import "@mantine/dates/styles.css";
import "@/public/css/components/SaveTimerModal.css";

const monday = mondaySdk();

interface SaveTimerModalProps {
	show: boolean;
	onClose: () => void;
	initialData?: {
		draftId?: number;
		taskSelection?: TaskSelection;
		comment?: string;
		date?: Date;
		duration?: string;
	};
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
export default function SaveTimerModal({ show, onClose, initialData }: SaveTimerModalProps) {
	const [selectedTask, setSelectedTask] = useState<TaskSelection | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [date, setDate] = useState<Date>(new Date());
	const [duration, setDuration] = useState("00:00");
	// Local comment state - used when modal is opened with initialData
	const [localComment, setLocalComment] = useState<string>("");

	// Store selectors
	const { refetch } = useTimeEntriesStore();
	const { rawContext } = useMondayStore();
	const { showToast } = useToast();
	const userProfile = useUserStore((state) => state.supabaseUser);

	// Timer store - using new API
	const globalComment = useTimerStore((state) => state.comment);
	const elapsedTime = useTimerStore((state) => state.elapsedTime);
	const draftId = useTimerStore((state) => state.draftId);
	const sessionId = useTimerStore((state) => state.sessionId);

	// Store actions
	const { setComment: setGlobalComment, reset: resetTimer } = useTimerStore.getState();

	// Use local comment when initialData is provided, otherwise use global comment
	const comment = initialData ? localComment : globalComment;
	const setComment = initialData ? setLocalComment : setGlobalComment;

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

	// Clear error state and selection when modal opens, sync duration with elapsed time or initial data
	useEffect(() => {
		if (show) {
			setError(null);

			// If initialData is provided, use it; otherwise use current timer state
			if (initialData) {
				setSelectedTask(initialData.taskSelection || null);
				setDate(initialData.date || new Date());
				setDuration(initialData.duration || "00:00");
				setLocalComment(initialData.comment || "");
			} else {
				setSelectedTask(null);
				setDate(new Date());
				setDuration(formatDurationFromMs(elapsedTime));
				setLocalComment(""); // Clear local comment when not using initialData
			}
		}
	}, [show, elapsedTime, initialData]);

	const handleTaskSelection = (taskData: TaskSelection) => {
		setSelectedTask(taskData);
	};

	const handleSave = async () => {
		// Use draftId from initialData if provided, otherwise use current timer's draftId
		const activeDraftId = initialData?.draftId || draftId;

		if (!activeDraftId || !selectedTask || !userProfile?.id) {
			console.error("Cannot save: missing required data", { draftId: activeDraftId, selectedTask, userId: userProfile?.id });
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

			console.log("Trying to save time entry with: ", { draftId: activeDraftId, taskName, comment, boardId: selectedTask.boardId, boardName: selectedTask.boardName, itemId: selectedTask.itemId, itemName: selectedTask.itemName, parentItemId: selectedTask.parentItemId || null, parentItemName: selectedTask.parentItemName || null, roleId: selectedTask.roleId, duration: durationSeconds, date: date.toISOString() });

			// Call API route to finalize time entry
			const response = await fetch("/api/time-entries/finalize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"monday-context": JSON.stringify(context),
				},
				body: JSON.stringify({
					draftId: activeDraftId,
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
						draftId: activeDraftId,
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
		<Modal show={show} onClose={onClose}>
			<Modal.Header>
				<Text size="lg" fw={600}>
					Timer speichern
				</Text>
			</Modal.Header>
			<Modal.Body>
				<Flex direction="column" gap="md">
					{error && <Text c="dki-error">{error}</Text>}

					<Flex gap="md" direction="column">
						<Flex gap="sm">
							<TimePicker label="Dauer" withAsterisk value={duration} onChange={(value) => setDuration(value)} clearable style={{ flex: 2 }} />
							<DatePicker label="Datum" placeholder="Datum auswählen" value={date} onChange={handleDateChange} valueFormat="DD.MM.YYYY" leftSection={<Icon name="calendar" size={16} color="var(--color--tertiary)" />} leftSectionPointerEvents="none" style={{ flex: 1 }} />
						</Flex>
						<Flex gap="sm">
							<ButtonGroup flex={2}>
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
							</ButtonGroup>
							<ButtonGroup flex={1}>
								<Button size="sm" variant="default" style={{ flex: 1, borderRadius: "5px 0 0 5px" }} onClick={() => adjustDuration(-15)}>
									-15m
								</Button>
								<Button size="sm" variant="default" style={{ flex: 1, borderRadius: "0 5px 5px 0" }} onClick={() => adjustDuration(-60)}>
									-1h
								</Button>
							</ButtonGroup>
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
			</Modal.Body>
		</Modal>
	);
}
