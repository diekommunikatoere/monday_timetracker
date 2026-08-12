// components/dashboard/EmptyCommentConfirmationModal.tsx
// Confirms saving a timer/draft whose comment field is empty.
"use client";

import { Flex, Text, Group } from "@mantine/core";
import { useEffect } from "react";

import { Button, Modal, Icon } from "@/components";

/**
 * Props for {@link EmptyCommentConfirmationModal}.
 *
 * @property show      - Controls {@link Modal} visibility.
 * @property onClose   - Closes the modal (cancel — do not save).
 * @property onConfirm - Proceeds with saving the draft despite the empty comment.
 * @property isSaving  - When true, disables both buttons and shows a spinner on the confirm button.
 */
interface EmptyCommentConfirmationModalProps {
	show: boolean;
	onClose: () => void;
	onConfirm: () => void;
	isSaving?: boolean;
}

/**
 * Confirmation modal shown before saving a timer/draft that has no comment.
 *
 * Asks the user whether to save the entry as a draft anyway ("Möchtest du den
 * Timer trotzdem als Entwurf speichern?"). While open it registers a global
 * `keydown` listener so pressing **Enter** confirms (unless `isSaving` is true),
 * mirroring the `returnKey` icon shown on the confirm button. The modal itself
 * performs no saving — it only signals intent via `onConfirm`/`onClose`; the
 * caller ({@link SaveTimerModal} flow) performs the actual save.
 *
 * @param props - Component props.
 * @returns A {@link Modal} titled "Kein Kommentar angegeben" with cancel/confirm buttons.
 */
export default function EmptyCommentConfirmationModal({ show, onClose, onConfirm, isSaving = false }: EmptyCommentConfirmationModalProps) {
	// Handle Enter keypress to confirm
	useEffect(() => {
		if (!show) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Enter" && !isSaving) {
				event.preventDefault();
				onConfirm();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [show, onConfirm, isSaving]);

	return (
		<Modal show={show} onClose={onClose} size="md">
			<Modal.Header>Kein Kommentar angegeben</Modal.Header>
			<Modal.Body>
				<Flex direction="column" gap="lg">
					<Text size="sm">Du hast keinen Kommentar für diesen Entwurf eingegeben. Möchtest du den Timer trotzdem als Entwurf speichern?</Text>

					<Group justify="flex-end" gap="sm">
						<Button variant="default" onClick={onClose} disabled={isSaving}>
							Abbrechen
						</Button>
						<Button
							variant="primary"
							onClick={onConfirm}
							loading={isSaving}
							leftSection={
								<Flex align="center">
									<Icon name="keyboard_return" size={18} color="white" weight="bold" />
								</Flex>
							}
						>
							Als Entwurf speichern
						</Button>
					</Group>
				</Flex>
			</Modal.Body>
		</Modal>
	);
}
