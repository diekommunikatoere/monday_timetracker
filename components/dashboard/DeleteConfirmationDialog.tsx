// components/dashboard/DeleteConfirmationDialog.tsx
"use client";

import { Modal, Text, Button, Group } from "@mantine/core";

interface DeleteConfirmationDialogProps {
	show: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	count: number;
}

export default function DeleteConfirmationDialog({ show, onConfirm, onCancel, count }: DeleteConfirmationDialogProps) {
	return (
		<Modal opened={show} onClose={onCancel} title="Löschen bestätigen" size="sm" centered>
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
		</Modal>
	);
}
