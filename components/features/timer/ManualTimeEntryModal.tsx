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
import { combineDateAndTime, durationToSeconds } from "@/lib/utils";
import { TimeEntryFormFields } from "../../shared/time-entries/TimeEntryFormFields";
import { useTimeEntryForm } from "../../shared/hooks/useTimeEntryForm";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

interface ManualTimeEntryModalProps {
	show: boolean;
	onClose: () => void;
}

export function ManualTimeEntryModal({ show, onClose }: ManualTimeEntryModalProps) {
	const [selectedTask, setSelectedTask] = useState<TaskSelection | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { values, isLocked, handlers } = useTimeEntryForm({ isEnabled: show, initialIsLocked: false });

	const { refetch } = useTimeEntriesStore();
	const { rawContext } = useMondayStore();
	const { showToast } = useToast();
	const userProfile = useUserStore((state) => state.supabaseUser);

	// Reset form when modal opens
	useEffect(() => {
		if (show) {
			handlers.setDate(new Date());
			handlers.handleDurationChange("00:00");
			handlers.setComment("");
			setSelectedTask(null);
			setError(null);
		}
	}, [show]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleSave = async () => {
		if (!selectedTask?.itemId || !userProfile?.id) {
			console.error("Cannot save: missing required data");
			return;
		}

		const durationSeconds = durationToSeconds(values.duration);
		if (durationSeconds === 0) {
			setError("Bitte geben Sie eine Dauer ein");
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
						isLocked={isLocked}
						onLockToggle={handlers.toggleLock}
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
						<Button onClick={handleSave} disabled={!selectedTask?.itemId || isSaving} loading={isSaving}>
							Speichern
						</Button>
					</Group>
				</Flex>
			</Modal.Body>
		</Modal>
	);
}

export default ManualTimeEntryModal;
