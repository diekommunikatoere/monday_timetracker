// components/dashboard/SaveTimerModal.tsx
"use client";

import { useState } from "react";
import { Flex, Text, TextField } from "@vibe/core";
import { formatTime } from "@/lib/utils";
import { Modal, ModalBasicLayout, ModalHeader, ModalContent, ModalFooter } from "@vibe/core/next";
import TaskItemSelector from "../TaskItemSelector";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import { useToast } from "@/components/ToastProvider";
import { supabase } from "@/lib/supabase/client";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

interface SaveTimerModalProps {
	show: boolean;
	onClose: () => void;
}

export default function SaveTimerModal({ show, onClose }: SaveTimerModalProps) {
	const [selectedTask, setSelectedTask] = useState<{
		boardId?: string;
		itemId?: string;
		role?: string;
	} | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { showToast } = useToast();
	const userProfile = useUserStore((state) => state.supabaseUser);
	const { comment, elapsedTime, draftId } = useTimerStore();
	const { updateComment, softResetTimer } = useTimerStore.getState();

	const handleTaskSelection = (taskData: { boardId?: string; itemId?: string; role?: string }) => {
		setSelectedTask(taskData);
	};

	const handleSave = async () => {
		if (!draftId || !selectedTask || !userProfile?.id) {
			console.error("Cannot save: missing required data");
			return;
		}

		setIsSaving(true);
		setError(null);

		try {
			const taskName = selectedTask.itemId ? `Task ${selectedTask.itemId}` : "Manual Entry";

			// Call RPC to finalize time entry
			const { data, error } = await supabase.rpc("finalize_time_entry", {
				p_user_id: userProfile.id,
				p_draft_id: draftId,
				p_task_name: taskName,
				p_comment: comment,
				p_board_id: selectedTask.boardId,
				p_item_id: selectedTask.itemId,
				p_role: selectedTask.role,
			});

			if (error) throw error;

			showToast("Zeiteintrag gespeichert.", "positive", 2000);

			// Soft reset timer (keeps draft but clears session)
			const context = await monday.get("context");
			await softResetTimer(context);

			onClose();
		} catch (err: any) {
			console.error("Error saving time entry:", err);
			setError(err.message || "Failed to save time entry");
			showToast("Fehler beim Speichern", "negative", 2000);
		} finally {
			setIsSaving(false);
		}
	};

	const handleChange = (value: string) => {
		updateComment(value);
	};

	return (
		<Flex id="save-timer-modal-outer">
			<Modal id="save-timer-modal" show={show} onClose={onClose} container={document.getElementById("save-timer-modal-outer") || undefined}>
				<ModalBasicLayout>
					<ModalHeader title={"Save Timer"} />
					<ModalContent>
						<Flex direction="column" gap={16}>
							<Text>Elapsed Time: {formatTime(elapsedTime)}</Text>

							{error && <Text style={{ color: "var(--negative-color)" }}>{error}</Text>}

							<TaskItemSelector
								onSelectionChange={handleTaskSelection}
								onResetRef={(resetFn) => {
									/* store reset function */
								}}
							/>

							<TextField inputAriaLabel="Kommentar hinzufügen..." value={comment} onChange={handleChange} placeholder="Kommentar hinzufügen..." />
						</Flex>
					</ModalContent>
				</ModalBasicLayout>
				<ModalFooter
					primaryButton={{
						text: "Speichern",
						onClick: handleSave,
						ariaLabel: "Zeit-Eintrag speichern",
						disabled: !selectedTask || isSaving,
					}}
					secondaryButton={{
						text: "Abbrechen",
						onClick: onClose,
						ariaLabel: "Zeit-Eintrag abbrechen",
					}}
				/>
			</Modal>
		</Flex>
	);
}
