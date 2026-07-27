// components/dashboard/DeleteConfirmationDialog.tsx
"use client";

import { Text, Group } from "@mantine/core";

import { Button, Modal } from "@/components";

/**
 * Props for {@link DeleteConfirmationDialog}.
 *
 * @property show     - Whether the modal is visible.
 * @property onConfirm- Called when the user confirms deletion (the actual delete is the caller's responsibility).
 * @property onCancel - Called on dismiss / cancel button; the same callback is used for the modal's `onClose`.
 * @property count    - Number of entries being deleted; drives singular vs plural copy (`"Eintrag"` / `"Einträge"`).
 */
interface DeleteConfirmationDialogProps {
	show: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	count: number;
}

/**
 * Confirmation modal shown before deleting one or more time entries.
 *
 * All copy is hard-coded in **German**. The body advertises a 5-second undo
 * window, but the undo behaviour itself lives in the caller — this component
 * only emits `onConfirm` / `onCancel`.
 *
 * @param props - {@link DeleteConfirmationDialogProps}.
 * @returns A `Modal` (from `@/components`) with confirm/cancel buttons, or the modal's empty close state.
 */
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
