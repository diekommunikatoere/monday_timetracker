// components/ManualTimeEntryModal.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Modal, Button, Group, Flex, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { TimeInput } from "@mantine/dates";
import TaskItemSelector, { TaskSelection } from "./TaskItemSelector";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import { Icon } from "@/components/Icon";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

interface ManualTimeEntryModalProps {
	show: boolean;
	onClose: () => void;
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

export default function ManualTimeEntryModal({ show, onClose }: ManualTimeEntryModalProps) {
	const [duration, setDuration] = useState("00:00");
	const [startTime, setStartTime] = useState(getCurrentTimeString());
	const [endTime, setEndTime] = useState(getCurrentTimeString());
	const [date, setDate] = useState<Date>(new Date());
	const [selectedTask, setSelectedTask] = useState<TaskSelection | null>(null);
	const [comment, setComment] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Ref to track which field triggered the update to prevent loops
	const updateSource = useRef<"duration" | "times" | null>(null);

	// Store selectors
	const { refetch } = useTimeEntriesStore();
	const { rawContext } = useMondayStore();
	const { showToast } = useToast();
	const userProfile = useUserStore((state) => state.supabaseUser);

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

	// Reset form when modal opens
	useEffect(() => {
		if (show) {
			const currentTime = getCurrentTimeString();
			setDuration("00:00");
			setStartTime(currentTime);
			setEndTime(currentTime);
			setDate(new Date());
			setSelectedTask(null);
			setComment("");
			setError(null);
			updateSource.current = null;
		}
	}, [show]);

	// Sync: When duration changes (from input or buttons), update end_time
	useEffect(() => {
		if (updateSource.current === "times") {
			updateSource.current = null;
			return;
		}

		const durationSeconds = durationToSeconds(duration);
		const newEndTime = addSecondsToTimeString(startTime, durationSeconds);
		updateSource.current = "duration";
		setEndTime(newEndTime);
	}, [duration, durationToSeconds]); // Note: removed startTime from deps since we only want to react to duration changes here

	// Sync: When start_time changes (user input), recalculate duration = end_time - new_start_time
	const handleStartTimeChange = useCallback(
		(newStartTime: string) => {
			setStartTime(newStartTime);
			updateSource.current = "times";
			const newDurationSeconds = calculateDurationBetweenTimes(newStartTime, endTime);
			setDuration(secondsToDuration(Math.max(0, newDurationSeconds)));
		},
		[endTime, secondsToDuration]
	);

	// Sync: When end_time changes (user input), recalculate duration = new_end_time - start_time
	const handleEndTimeChange = useCallback(
		(newEndTime: string) => {
			setEndTime(newEndTime);
			updateSource.current = "times";
			const newDurationSeconds = calculateDurationBetweenTimes(startTime, newEndTime);
			setDuration(secondsToDuration(Math.max(0, newDurationSeconds)));
		},
		[startTime, secondsToDuration]
	);

	const handleTaskSelection = (taskData: TaskSelection) => {
		setSelectedTask(taskData);
	};

	// Adjust duration by minutes (this updates end_time via useEffect)
	const adjustDuration = (minutesToAdd: number) => {
		const currentSeconds = durationToSeconds(duration);
		const newSeconds = Math.max(0, currentSeconds + minutesToAdd * 60);
		setDuration(secondsToDuration(newSeconds));
		// end_time will be updated by the useEffect watching duration
	};

	const handleSave = async () => {
		if (!selectedTask?.itemId || !userProfile?.id) {
			console.error("Cannot save: missing required data", { selectedTask, userId: userProfile?.id });
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
			const taskName = selectedTask.itemName || "Unbenannter Zeit-Eintrag";
			const context = rawContext || (await monday.get("context"));

			console.log("selectedTask", selectedTask);

			// Build full ISO date-time strings from date + time inputs
			const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD
			const startTimeIso = `${dateStr}T${startTime}:00`;
			const endTimeIso = `${dateStr}T${endTime}:00`;

			// Create manual time entry
			const response = await fetch("/api/time-entries/manual", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"monday-context": JSON.stringify(context),
				},
				body: JSON.stringify({
					userId: userProfile.id,
					taskName,
					comment,
					boardId: selectedTask.boardId,
					boardName: selectedTask.boardName,
					itemId: selectedTask.itemId,
					itemName: selectedTask.itemName,
					parentItemId: selectedTask.parentItemId,
					parentItemName: selectedTask.parentItemName,
					roleId: selectedTask.roleId,
					duration: durationSeconds,
					date: date.toISOString(),
					startTime: startTimeIso,
					endTime: endTimeIso,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to save time entry");
			}

			showToast("Zeiteintrag gespeichert.", "positive", 2000);

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
		<Modal opened={show} onClose={onClose} title="Zeit eintragen" size="lg" padding="xl">
			<Flex direction="column" gap="md">
				{error && <div style={{ color: "var(--mantine-color-red-6)" }}>{error}</div>}

				{/* Start and End Time Inputs */}
				<Flex gap="md">
					<TimeInput label="Startzeit" value={startTime} onChange={(event) => handleStartTimeChange(event.currentTarget.value)} style={{ flex: 1 }} />
					<TimeInput label="Endzeit" value={endTime} onChange={(event) => handleEndTimeChange(event.currentTarget.value)} style={{ flex: 1 }} />
				</Flex>

				{/* Duration Input with Quick Adjustment Buttons */}
				<Flex gap="md" direction="column">
					<Flex gap="xs" align="center">
						<TimeInput label="Dauer" required value={duration} onChange={(event) => setDuration(event.currentTarget.value)} style={{ flex: 2 }} />
						{/* Date Picker */}
						<DatePickerInput label="Datum" placeholder="Datum auswählen" value={date} onChange={(newDate) => newDate && setDate(new Date(newDate))} valueFormat="DD.MM.YYYY" leftSection={<Icon name="calendar" size={16} color="var(--color--tertiary)" />} leftSectionPointerEvents="none" style={{ flex: 1 }} />
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

				{/* Task Selector (Board, Task, Role) */}
				<TaskItemSelector onSelectionChange={handleTaskSelection} />

				{/* Comment Input */}
				<TextInput label="Kommentar" value={comment} onChange={(event) => setComment(event.currentTarget.value)} placeholder="Kommentar hinzufügen..." />

				<Group justify="flex-end" mt="md">
					<Button variant="default" onClick={onClose} aria-label="Zeit-Eintrag abbrechen">
						Abbrechen
					</Button>
					<Button onClick={handleSave} disabled={!selectedTask?.itemId || isSaving} loading={isSaving} aria-label="Zeit-Eintrag speichern">
						{isSaving ? "Speichern..." : "Speichern"}
					</Button>
				</Group>
			</Flex>
		</Modal>
	);
}
