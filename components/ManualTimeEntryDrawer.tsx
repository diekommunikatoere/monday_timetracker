import { Drawer, Button, Group } from "@mantine/core";

interface ManualTimeEntryDrawerProps {
	show: boolean;
	onClose: () => void;
}
export default function ManualTimeEntryDrawer({ show, onClose }: ManualTimeEntryDrawerProps) {
	return (
		<Drawer opened={show} onClose={onClose} title="Zeit-Eintrag manuell erfassen" size="lg">
			<Group justify="flex-end" mt="md">
				<Button
					variant="default"
					onClick={() => {
						console.log("secondary drawer button clicked.");
						onClose();
					}}
					aria-label="Zeit-Eintrag abbrechen"
				>
					Abbrechen
				</Button>
				<Button
					onClick={() => {
						console.log("primary drawer button clicked.");
						onClose();
					}}
					aria-label="Zeit-Eintrag speichern"
				>
					Speichern
				</Button>
			</Group>
		</Drawer>
	);
}
