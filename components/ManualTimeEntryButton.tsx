import { Button } from "@mantine/core";
import Add from "@/components/icons/Add";

export default function ManualTimeEntryButton(props: { onClick: () => void }) {
	return (
		<Button onClick={props.onClick} aria-label="Manuelle Zeiteingabe" aria-controls="manualTimeEntryDrawer" leftSection={<Add fillColor="#FFFFFF" />}>
			Zeit eintragen
		</Button>
	);
}
