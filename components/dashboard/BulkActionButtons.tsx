// components/dashboard/BulkActionButtons.tsx
"use client";

import { Card, Flex, Text } from "@mantine/core";
import { Button } from "@/components/ui/buttons/Button";
import { Icon } from "@/components";

import classes from "@/components/styles/features/time-entries/BulkActions.module.css";

/**
 * Props for {@link BulkActionButtons}.
 *
 * @property selectedIds       - Time-entry ids the user has checked; the panel renders nothing when empty.
 * @property onBulkDelete      - Invoked with the selected ids when "Löschen" is clicked (parent confirms + calls the API).
 * @property onClearSelection  - Invoked when "Abbrechen" is clicked to clear the selection.
 */
interface BulkActionButtonsProps {
	selectedIds: string[];
	onBulkDelete: (ids: string[]) => void;
	onClearSelection: () => void;
}

/**
 * Floating action panel shown over the dashboard time-entries table when one or
 * more rows are selected.
 *
 * Returns `null` while `selectedIds` is empty, so it occupies no space until a
 * selection exists. Otherwise it renders a {@link Card} reporting the selection
 * count (singular "Eintrag" vs plural "Einträge") with two buttons: "Abbrechen"
 * (clears the selection) and "Löschen" (fires `onBulkDelete` with all selected
 * ids). The actual deletion/confirmation lives in the parent ({@link TimeEntriesTable}).
 *
 * @param props - Component props.
 * @returns The bulk-action card, or `null` when nothing is selected.
 */
export default function BulkActionButtons({ selectedIds, onBulkDelete, onClearSelection }: BulkActionButtonsProps) {
	if (selectedIds.length === 0) {
		return null;
	}

	return (
		<Card className={classes["bulk-action-buttons--container-outer"]} padding="md" withBorder>
			<Flex direction="column" gap="sm" justify="space-between" align="stretch">
				<Text size="sm" fw={500} ta="center">
					{selectedIds.length} {selectedIds.length === 1 ? "Eintrag" : "Einträge"} ausgewählt
				</Text>
				<Flex direction={"column"} gap="sm" justify="center" align="stretch">
					<Button variant="default" onClick={onClearSelection} fullWidth size="sm" leftSection={<Icon name="close" size={18} />}>
						Abbrechen
					</Button>
					<Button variant="warning" onClick={() => onBulkDelete(selectedIds)} fullWidth size="sm" leftSection={<Icon name="delete" size={18} />}>
						Löschen
					</Button>
				</Flex>
			</Flex>
		</Card>
	);
}
