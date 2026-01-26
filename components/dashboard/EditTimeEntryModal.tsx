// components/dashboard/EditTimeEntryModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Flex, Text, TextInput, Group } from "@mantine/core";
import { Button, ButtonGroup, Modal } from "@/components";
import { DatePicker, TimePicker } from "@/components";
import TaskItemSelector, { TaskSelection } from "../TaskItemSelector";
import { useUserStore } from "@/stores/userStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useToast } from "@/components/ToastProvider";
import { TimeEntry } from "@/types/time-entry";
import { Icon } from "@/components";
import mondaySdk from "monday-sdk-js";

import "@mantine/dates/styles.css";

const monday = mondaySdk();

interface EditTimeEntryModalProps {
	show: boolean;
	onClose: () => void;
	entry: TimeEntry;
	onSaved: () => void;
}

export default function EditTimeEntryModal({ show, onClose, entry, onSaved }: EditTimeEntryModalProps) {
	const [selectedTask, setSelectedTask] = useState<TaskSelection | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [date, setDate] = useState<Date>(new Date());
	const [duration, setDuration] = useState("00:00");
	const [comment, setComment] = useState("");
	const [taskName, setTaskName] = useState("");

	const { refetch } = useTimeEntriesStore();
	const { rawContext } = useMondayStore();
	const { showToast } = useToast();
	const userProfile = useUserStore((state) => state.supabaseUser);

	// Convert seconds to HH:MM
	const formatDurationFromSeconds = (seconds: number): string => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
	};

	// Convert HH:MM to seconds
	const durationToSeconds = (timeStr: string): number => {
		const [hours, minutes] = timeStr.split(":").map(Number);
		return (hours || 0) * 3600 + (minutes || 0) * 60;
	};

	// Adjust duration by minutes
	const adjustDuration = (minutesToAdd: number) => {
		const currentSeconds = durationToSeconds(duration);
		const newSeconds = Math.max(0, currentSeconds + minutesToAdd * 60);
		const hours = Math.floor(newSeconds / 3600);
		const minutes = Math.floor((newSeconds % 3600) / 60);
		setDuration(`${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`);
	};

	// Initialize form with entry data
	useEffect(() => {
		if (show && entry) {
			setError(null);
			setTaskName(entry.task_name || "");
			setComment(entry.comment || "");
			setDate(new Date(entry.start_time));
			setDuration(formatDurationFromSeconds(entry.duration || 0));
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
	}, [show, entry]);

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
			console.log("patching entry", entry.id, "with data: ", {
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
				start_time: date.toISOString(),
				expectedUpdatedAt: entry.updated_at,
			});
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
					start_time: date.toISOString(),
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
