// components/dashboard/SaveTimerModal.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Flex, Text, TextInput, Group, Tooltip } from "@mantine/core";
import { Button, ButtonGroup, IconButton, Modal } from "@/components";
import { DatePicker, TimePicker } from "@/components";
import { TimeInput } from "@mantine/dates";
import TaskItemSelector, { TaskSelection } from "../TaskItemSelector";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import mondaySdk from "monday-sdk-js";
import { Icon } from "@/components";
import { roundDuration } from "@/lib/utils";

import "@mantine/dates/styles.css";
import "@/public/css/components/SaveTimerModal.css";

const monday = mondaySdk();

interface SaveTimerModalProps {
	show: boolean;
	onClose: () => void;
	initialData?: {
		draftId?: string;
		taskSelection?: TaskSelection;
		comment?: string;
		date?: Date;
		duration?: string;
	};
}

// Helper to get current time as HH:MM string
const getCurrentTimeString = (): string => {
	const now = new Date();
	return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

// Helper to add duration (in seconds) to a time string HH:MM and return new HH:MM
const addSecondsToTimeString = (timeStr: string, seconds: number): string => {
	const [hours, minutes] = timeStr.split(":").map(Number);
	const totalMinutes = (hours || 0) * 60 + (minutes || 0) + Math.floor(seconds / 60);
	const newHours = Math.floor(totalMinutes / 60) % 24; // Wrap around at 24 hours
	const newMinutes = totalMinutes % 60;
	return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
};

// Helper to subtract duration (in seconds) from a time string HH:MM and return new HH:MM
const subtractSecondsFromTimeString = (timeStr: string, seconds: number): string => {
	const [hours, minutes] = timeStr.split(":").map(Number);
	let totalMinutes = (hours || 0) * 60 + (minutes || 0) - Math.floor(seconds / 60);
	if (totalMinutes < 0) {
		totalMinutes += 24 * 60; // Wrap around for previous day
	}
	const newHours = Math.floor(totalMinutes / 60) % 24;
	const newMinutes = totalMinutes % 60;
	return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
};

// Helper to calculate duration in seconds between two time strings HH:MM
const calculateDurationBetweenTimes = (startTime: string, endTime: string): number => {
	const [startHours, startMinutes] = startTime.split(":").map(Number);
	const [endHours, endMinutes] = endTime.split(":").map(Number);

	const startTotalMinutes = (startHours || 0) * 60 + (startMinutes || 0);
	let endTotalMinutes = (endHours || 0) * 60 + (endMinutes || 0);

	// Handle case where end time is before start time (next day)
	if (endTotalMinutes < startTotalMinutes) {
		endTotalMinutes += 24 * 60; // Add 24 hours
	}

	return (endTotalMinutes - startTotalMinutes) * 60; // Return seconds
};

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
	const [startTime, setStartTime] = useState(getCurrentTimeString());
	const [endTime, setEndTime] = useState(getCurrentTimeString());
	const [isLocked, setIsLocked] = useState(true);

	// Ref to track which field triggered the update to prevent loops
	const updateSource = useRef<"duration" | "times" | "lock" | null>(null);

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
	const durationToSeconds = useCallback((timeStr: string): number => {
		const [hours, minutes] = timeStr.split(":").map(Number);
		return (hours || 0) * 3600 + (minutes || 0) * 60;
	}, []);

	// Convert seconds to HH:MM
	const secondsToDuration = useCallback((seconds: number): string => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
	}, []);

	// Adjust duration by minutes
	const adjustDuration = (minutesToAdd: number) => {
		const currentSeconds = durationToSeconds(duration);
		const newSeconds = Math.max(0, currentSeconds + minutesToAdd * 60);
		setDuration(secondsToDuration(newSeconds));
	};

	// Clear error state and selection when modal opens, sync duration with elapsed time or initial data
	useEffect(() => {
		if (show) {
			setError(null);
			setIsLocked(true);
			updateSource.current = null;

			// If initialData is provided, use it; otherwise use current timer state
			if (initialData) {
				setSelectedTask(initialData.taskSelection || null);
				setDate(initialData.date || new Date());
				setDuration(initialData.duration || "00:00");
				setLocalComment(initialData.comment || "");
			} else {
				setSelectedTask(null);
				setDate(new Date());
				// Round the elapsed time for display
				const roundedSeconds = roundDuration(Math.floor(elapsedTime / 1000));
				setDuration(secondsToDuration(roundedSeconds));
				setLocalComment(""); // Clear local comment when not using initialData
			}

			const currentTime = getCurrentTimeString();
			setEndTime(currentTime);
		}
	}, [show, elapsedTime, initialData, secondsToDuration]);

	// Live update for locked end time
	useEffect(() => {
		if (!show || !isLocked) return;

		const interval = setInterval(() => {
			const currentTime = getCurrentTimeString();
			if (currentTime !== endTime) {
				updateSource.current = "lock";
				setEndTime(currentTime);
				// When end time updates automatically, we need to update start time based on duration
				const durationSeconds = durationToSeconds(duration);
				setStartTime(subtractSecondsFromTimeString(currentTime, durationSeconds));
			}
		}, 10000); // Check every 10 seconds

		return () => clearInterval(interval);
	}, [show, isLocked, endTime, duration, durationToSeconds]);

	// Sync: When duration changes (from input or buttons), update start_time (if locked) or end_time (if unlocked)
	useEffect(() => {
		if (updateSource.current === "times" || updateSource.current === "lock") {
			updateSource.current = null;
			return;
		}

		const durationSeconds = durationToSeconds(duration);
		if (isLocked) {
			const newStartTime = subtractSecondsFromTimeString(endTime, durationSeconds);
			updateSource.current = "duration";
			setStartTime(newStartTime);
		} else {
			const newEndTime = addSecondsToTimeString(startTime, durationSeconds);
			updateSource.current = "duration";
			setEndTime(newEndTime);
		}
	}, [duration, durationToSeconds, isLocked, endTime, startTime]);

	// Sync: When start_time changes (user input), recalculate duration = end_time - new_start_time
	const handleStartTimeChange = useCallback(
		(newStartTime: string) => {
			setStartTime(newStartTime);
			updateSource.current = "times";
			const newDurationSeconds = calculateDurationBetweenTimes(newStartTime, endTime);
			setDuration(secondsToDuration(Math.max(0, newDurationSeconds)));
			// Manual edit unlocks the end time
			if (isLocked) setIsLocked(false);
		},
		[endTime, secondsToDuration, isLocked],
	);

	// Sync: When end_time changes (user input), recalculate duration = new_end_time - start_time
	const handleEndTimeChange = useCallback(
		(newEndTime: string) => {
			setEndTime(newEndTime);
			updateSource.current = "times";
			const newDurationSeconds = calculateDurationBetweenTimes(startTime, newEndTime);
			setDuration(secondsToDuration(Math.max(0, newDurationSeconds)));
			// Manual edit unlocks the end time
			if (isLocked) setIsLocked(false);
		},
		[startTime, secondsToDuration, isLocked],
	);

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
		<Modal show={show} onClose={onClose} size={"lg"}>
			<Modal.Header>Zeiteintrag speichern</Modal.Header>
			<Modal.Body>
				<Flex direction="column" gap="md">
					{error && <Text c="dki-error">{error}</Text>}

					<Flex gap="md" direction="column">
						<Flex gap="sm">
							<TimeInput label="Startzeit" value={startTime} onChange={(event) => handleStartTimeChange(event.currentTarget.value)} style={{ flex: 1 }} />
							<TimeInput
								label="Endzeit"
								value={endTime}
								onChange={(event) => handleEndTimeChange(event.currentTarget.value)}
								style={{ flex: 1 }}
								disabled={isLocked}
								rightSection={
									<Tooltip label={isLocked ? "Endzeit fixiert (Live)" : "Endzeit fixieren"} position="top" withArrow>
										<IconButton variant="filled" color={isLocked ? "var(--color--primary)" : "var(--color--background-secondary)"} onClick={() => setIsLocked(!isLocked)} aria-label="Endzeit fixieren">
											<Icon name={isLocked ? "lock" : "unlock"} size={16} color={isLocked ? "var(--color--text-on-primary)" : "var(--color--text-secondary)"} />
										</IconButton>
									</Tooltip>
								}
								styles={{
									input: isLocked
										? {
												color: "var(--color--text-primary)",
												borderColor: "transparent",
												backgroundColor: "var(--color--background-secondary)",
												transition: "all 0.2s ease",
											}
										: {},
								}}
							/>
						</Flex>
						<Flex gap="sm">
							<TimeInput label="Dauer" withAsterisk value={duration} onChange={(event) => setDuration(event.currentTarget.value)} style={{ flex: 2 }} />
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
