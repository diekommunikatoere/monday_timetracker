import { Button } from "@mantine/core";
import { Icon } from "@/components/Icon";

export default function ManualTimeEntryButton(props: { onClick: () => void }) {
	return (
		<Button onClick={props.onClick} aria-label="Manuelle Zeiteingabe" aria-controls="manualTimeEntryModal" leftSection={<Icon name="add" color="#FFFFFF" />}>
			Zeit eintragen
		</Button>
	);
}
