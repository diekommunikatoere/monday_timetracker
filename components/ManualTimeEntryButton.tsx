import { Tooltip } from "@mantine/core";
import { Button } from "@/components/ui/buttons/Button";
import { Icon } from "@/components/Icon";

export default function ManualTimeEntryButton(props: { onClick: () => void }) {
	return (
		<Tooltip label="Manuell Zeit eintragen" position="top" withArrow>
			<Button onClick={props.onClick} aria-label="Manuelle Zeiteingabe" aria-controls="manualTimeEntryModal" iconLeft={<Icon name="add" color="#FFFFFF" />}>
				Zeit eintragen
			</Button>
		</Tooltip>
	);
}
