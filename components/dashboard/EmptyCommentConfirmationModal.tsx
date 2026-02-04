"use client";

import { useEffect } from "react";
import { Flex, Text, Group } from "@mantine/core";
import { Button, Modal, Icon } from "@/components";

interface EmptyCommentConfirmationModalProps {
	show: boolean;
	onClose: () => void;
	onConfirm: () => void;
	isSaving?: boolean;
}

/**
 * EmptyCommentConfirmationModal - Confirmation modal when saving a draft without a comment
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
							rightSection={
								<Flex align="center">
									<Icon name="returnKey" size={16} color="white" weight="bold" />
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
