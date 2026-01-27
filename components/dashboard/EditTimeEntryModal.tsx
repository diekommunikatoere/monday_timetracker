// components/dashboard/EditTimeEntryModal.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Flex, Text, TextInput, Group, Tooltip } from "@mantine/core";
import { Button, ButtonGroup, IconButton, Modal } from "@/components";
import { DatePicker, TimePicker } from "@/components";
import { TimeInput } from "@mantine/dates";
import TaskItemSelector, { TaskSelection } from "../TaskItemSelector";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import { TimeEntry } from "@/types/time-entry";
import { Icon } from "@/components";
import mondaySdk from "monday-sdk-js";
import { combineDateAndTime } from "@/lib/utils";

import "@mantine/dates/styles.css";

const monday = mondaySdk();

interface EditTimeEntryModalProps {
	show: boolean;
	onClose: () => void;
	entry: TimeEntry;
	onSaved: () => void;
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

export default function EditTimeEntryModal({ show, onClose, entry, onSaved }: EditTimeEntryModalProps) {
	const [selectedTask, setSelectedTask] = useState<TaskSelection | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [date, setDate] = useState<Date>(new Date());
	const [duration, setDuration] = useState("00:00");
	const [startTime, setStartTime] = useState("00:00");
	const [endTime, setEndTime] = useState("00:00");
	const [isLocked, setIsLocked] = useState(false);
	const [comment, setComment] = useState("");
	const [taskName, setTaskName] = useState("");

	// Ref to track which field triggered the update to prevent loops
	const updateSource = useRef<"duration" | "times" | "lock" | null>(null);

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

	// Adjust duration by minutes
	const adjustDuration = (minutesToAdd: number) => {
		const currentSeconds = durationToSeconds(duration);
		const newSeconds = Math.max(0, currentSeconds + minutesToAdd * 60);
		setDuration(secondsToDuration(newSeconds));
	};

	// Initialize form with entry data
	useEffect(() => {
		if (show && entry) {
			setError(null);
			setTaskName(entry.task_name || "");
			setComment(entry.comment || "");
			const startDate = new Date(entry.start_time);
			setDate(startDate);
			setDuration(secondsToDuration(entry.duration || 0));

			const startH = String(startDate.getHours()).padStart(2, "0");
			const startM = String(startDate.getMinutes()).padStart(2, "0");
			setStartTime(`${startH}:${startM}`);

			const endDate = new Date(entry.end_time || entry.start_time);
			const endH = String(endDate.getHours()).padStart(2, "0");
			const endM = String(endDate.getMinutes()).padStart(2, "0");
			setEndTime(`${endH}:${endM}`);

			setIsLocked(false);
			updateSource.current = null;

			setSelectedTask({
				boardId: entry.board_id || "",
				boardName: entry.board_name || "",
				itemId: entry.item_id || "",
				itemName: entry.item_name || "",
				parentItemId: entry.parent_item_id || undefined,
				parentItemName: entry.parent_item_name || undefined,
				roleId: entry.role_id || "",
				roleName: entry.role_name || "",
			});
		}
	}, [show, entry, secondsToDuration]);

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

	// Handle setting start time to now with duration consistency
	const handleStartTimeNowClick = useCallback(() => {
		const now = getCurrentTimeString();
		const currentDurationSeconds = calculateDurationBetweenTimes(startTime, endTime);
		updateSource.current = "times";

		// Update Start Time to Now and shift End Time to maintain duration
		setStartTime(now);
		const newEndTime = addSecondsToTimeString(now, currentDurationSeconds);
		setEndTime(newEndTime);

		// Manual adjustment via "Now" button unlocks the end time
		if (isLocked) setIsLocked(false);
	}, [startTime, endTime, isLocked]);

	// Handle setting end time to now with duration consistency
	const handleEndTimeNowClick = useCallback(() => {
		const now = getCurrentTimeString();
		const currentDurationSeconds = calculateDurationBetweenTimes(startTime, endTime);
		updateSource.current = "times";

		// Update End Time to Now and shift Start Time to maintain duration
		setEndTime(now);
		const newStartTime = subtractSecondsFromTimeString(now, currentDurationSeconds);
		setStartTime(newStartTime);

		// Manual adjustment via "Now" button unlocks the end time
		if (isLocked) setIsLocked(false);
	}, [startTime, endTime, isLocked]);

	const handleTaskSelection = (taskData: TaskSelection) => {
		setSelectedTask(taskData);
	};

	const handleSave = async () => {
		if (!selectedTask || !userProfile?.id) {
			console.error("Cannot save: missing required data");
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
			// Build full ISO date-time strings from date + time inputs
			const startTimeIso = combineDateAndTime(date, startTime);
			const endTimeIso = combineDateAndTime(date, endTime);

			const response = await fetch(`/api/time-entries/${entry.id}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					userId: userProfile.id,
				},
				body: JSON.stringify({
					id: entry.id,
					task_name: taskName || selectedTask.itemName,
					comment,
					board_id: selectedTask.boardId,
					board_name: selectedTask.boardName,
					item_id: selectedTask.itemId,
					item_name: selectedTask.itemName,
					parent_item_id: selectedTask.parentItemId || null,
					parent_item_name: selectedTask.parentItemName || null,
					role_id: selectedTask.roleId,
					duration: durationSeconds,
					start_time: startTimeIso,
					end_time: endTimeIso,
					expectedUpdatedAt: entry.updated_at, // Optimistic locking
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();

				// Handle concurrent modification
				if (response.status === 409) {
					setError("Dieser Eintrag wurde von einem anderen Benutzer geändert. Bitte aktualisieren Sie die Seite und versuchen Sie es erneut.");
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
			console.error("Error updating time entry:", err);
			setError(err.message || "Fehler beim Aktualisieren des Zeiteintrags");
			showToast("Fehler beim Aktualisieren", "negative", 2000);
		} finally {
			setIsSaving(false);
		}
	};

	const handleDateChange = (val: Date | string | null) => {
		if (!val) return;
		if (val instanceof Date) {
			setDate(val);
		} else if (typeof val === "string") {
			const [day, month, year] = val.split(".").map(Number);
			if (day && month && year) {
				setDate(new Date(year, month - 1, day));
			}
		}
	};

	return (
		<Modal show={show} onClose={onClose} size={"lg"}>
			<Modal.Header>Zeiteintrag bearbeiten</Modal.Header>
			<Modal.Body>
				<Flex direction="column" gap="md">
					{error && <Text c="dki-error">{error}</Text>}

					<Flex gap="md" direction="column">
						<Flex gap="sm">
							<TimeInput
								label="Startzeit"
								value={startTime}
								onChange={(event) => handleStartTimeChange(event.currentTarget.value)}
								leftSection={
									<Tooltip label="Jetzt" position="top" withArrow>
										<IconButton variant="filled" color="var(--color--background-secondary)" onClick={handleStartTimeNowClick} aria-label="Startzeit auf jetzt setzen">
											<Icon name="today" size={16} color="var(--color--text-secondary)" />
										</IconButton>
									</Tooltip>
								}
								style={{ flex: 1 }}
							/>
							<TimeInput
								label="Endzeit"
								value={endTime}
								onChange={(event) => handleEndTimeChange(event.currentTarget.value)}
								style={{ flex: 1 }}
								disabled={isLocked}
								leftSection={
									<Tooltip label="Jetzt" position="top" withArrow>
										<IconButton variant="filled" color="var(--color--background-secondary)" onClick={handleEndTimeNowClick} aria-label="Endzeit auf jetzt setzen">
											<Icon name="today" size={16} color="var(--color--text-secondary)" />
										</IconButton>
									</Tooltip>
								}
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

					<TextInput aria-label="Kommentar hinzufügen..." value={comment} onChange={(e) => setComment(e.currentTarget.value)} placeholder="Kommentar hinzufügen..." label="Kommentar" />

					<Group justify="flex-end" mt="md">
						<Button variant="default" onClick={onClose}>
							Abbrechen
						</Button>
						<Button onClick={handleSave} disabled={!selectedTask?.itemId || isSaving} loading={isSaving}>
							{isSaving ? "Aktualisieren..." : "Aktualisieren"}
						</Button>
					</Group>
				</Flex>
			</Modal.Body>
		</Modal>
	);
}
