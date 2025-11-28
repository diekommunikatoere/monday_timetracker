// components/ManualTimeEntryModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Modal, Button, Group, Flex, TextInput, ActionIcon } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { TimeInput } from "@mantine/dates";
import TaskItemSelector, { TaskSelection } from "./TaskItemSelector";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

interface ManualTimeEntryModalProps {
	show: boolean;
	onClose: () => void;
}

export default function ManualTimeEntryModal({ show, onClose }: ManualTimeEntryModalProps) {
	const [duration, setDuration] = useState("00:00");
	const [date, setDate] = useState<Date>(new Date());
	const [selectedTask, setSelectedTask] = useState<TaskSelection | null>(null);
	const [comment, setComment] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Store selectors
	const { refetch } = useTimeEntriesStore();
	const { rawContext } = useMondayStore();
	const { showToast } = useToast();
	const userProfile = useUserStore((state) => state.supabaseUser);

	// Reset form when modal opens
	useEffect(() => {
		if (show) {
			setDuration("00:00");
			setDate(new Date());
			setSelectedTask(null);
			setComment("");
			setError(null);
		}
	}, [show]);

	const handleTaskSelection = (taskData: TaskSelection) => {
		setSelectedTask(taskData);
	};

	// Convert HH:MM to seconds
	const durationToSeconds = (timeStr: string): number => {
		const [hours, minutes] = timeStr.split(":").map(Number);
		return (hours || 0) * 3600 + (minutes || 0) * 60;
	};

	// Convert seconds to HH:MM
	const secondsToDuration = (seconds: number): string => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
	};

	// Adjust duration by minutes
	const adjustDuration = (minutesToAdd: number) => {
		const currentSeconds = durationToSeconds(duration);
		const newSeconds = Math.max(0, currentSeconds + minutesToAdd * 60);
		setDuration(secondsToDuration(newSeconds));
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
		<Modal opened={show} onClose={onClose} title="Zeit eintragen" size="lg">
			<Flex direction="column" gap="md">
				{error && <div style={{ color: "var(--mantine-color-red-6)" }}>{error}</div>}

				{/* Duration Input with Quick Adjustment Buttons */}
				<div>
					<label style={{ display: "block", marginBottom: "4px", fontSize: "14px", fontWeight: 500 }}>Dauer *</label>
					<Flex gap="xs" align="center">
						<TimeInput value={duration} onChange={(event) => setDuration(event.currentTarget.value)} style={{ flex: 1 }} />
						<Button size="xs" variant="default" onClick={() => adjustDuration(15)}>
							+15m
						</Button>
						<Button size="xs" variant="default" onClick={() => adjustDuration(30)}>
							+30m
						</Button>
						<Button size="xs" variant="default" onClick={() => adjustDuration(60)}>
							+1h
						</Button>
						<Button size="xs" variant="default" onClick={() => adjustDuration(120)}>
							+2h
						</Button>
						<Button size="xs" variant="default" onClick={() => adjustDuration(-15)}>
							-15m
						</Button>
						<Button size="xs" variant="default" onClick={() => adjustDuration(-60)}>
							-1h
						</Button>
					</Flex>
				</div>

				{/* Date Picker */}
				<DatePickerInput label="Datum" placeholder="Datum auswählen" value={date} onChange={(newDate) => newDate && setDate(newDate)} valueFormat="DD.MM.YYYY" />

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
