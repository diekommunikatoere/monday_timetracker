// components/dashboard/DeleteConfirmationDialog.tsx
"use client";

import { Text, Group } from "@mantine/core";
import { Button, Modal } from "@/components";

interface DeleteConfirmationDialogProps {
	show: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	count: number;
}

export default function DeleteConfirmationDialog({ show, onConfirm, onCancel, count }: DeleteConfirmationDialogProps) {
	return (
		<Modal show={show} onClose={onCancel}>
			<Modal.Header>
				<Text size="lg" fw={600}>
					Löschen bestätigen
				</Text>
			</Modal.Header>
			<Modal.Body>
				<Text size="sm" mb="md">
					Möchten Sie wirklich {count} {count === 1 ? "Eintrag" : "Einträge"} löschen?
				</Text>
				<Text size="xs" c="dimmed" mb="lg">
					Sie haben 5 Sekunden Zeit, um die Löschung rückgängig zu machen.
				</Text>
				<Group justify="flex-end">
					<Button variant="default" onClick={onCancel}>
						Abbrechen
					</Button>
					<Button color="red" onClick={onConfirm}>
						Löschen
					</Button>
				</Group>
			</Modal.Body>
		</Modal>
	);
}
