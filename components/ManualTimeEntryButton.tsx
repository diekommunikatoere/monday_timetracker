// components/ManualTimeEntryButton.tsx
// Primary button that opens the manual time-entry modal.

import { Tooltip } from "@mantine/core";
import { Button } from "@/components/ui/buttons/Button";
import { Icon } from "@/components";

/**
 * A primary call-to-action button labelled "Zeit eintragen" ("Enter time")
 * wrapped in a Mantine `Tooltip`. It is used to open the manual time-entry
 * modal from the timer UI. The button carries `aria-label` /
 * `aria-controls="manualTimeEntryModal"` for screen-reader users and renders
 * an "add" glyph via {@link Icon}.
 *
 * @param props.onClick - Click handler, normally wired to open the entry modal.
 * @returns A `Tooltip`-wrapped primary `Button` with an add icon.
 */
export default function ManualTimeEntryButton(props: { onClick: () => void }) {
	return (
		<Tooltip label="Manuell Zeit eintragen" position="top" withArrow>
			<Button onClick={props.onClick} aria-label="Manuelle Zeiteingabe" aria-controls="manualTimeEntryModal" iconLeft={<Icon name="add" color="var(--color--icon-on-primary)" />}>
				Zeit eintragen
			</Button>
		</Tooltip>
	);
}
