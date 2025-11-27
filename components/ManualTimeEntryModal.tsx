import { Modal, Button, Group } from "@mantine/core";

interface ManualTimeEntryModalProps {
	show: boolean;
	onClose: () => void;
}
export default function ManualTimeEntryModal({ show, onClose }: ManualTimeEntryModalProps) {
	return (
		<Modal opened={show} onClose={onClose} title="Zeit-Eintrag manuell erfassen" size="lg">
			<Group justify="flex-end" mt="md">
				<Button
					variant="default"
					onClick={() => {
						console.log("secondary modal button clicked.");
						onClose();
					}}
					aria-label="Zeit-Eintrag abbrechen"
				>
					Abbrechen
				</Button>
				<Button
					onClick={() => {
						console.log("primary modal button clicked.");
						onClose();
					}}
					aria-label="Zeit-Eintrag speichern"
				>
					Speichern
				</Button>
			</Group>
		</Modal>
	);
}
