// components/dashboard/BulkActionButtons.tsx
"use client";

import { Card, Flex, Text } from "@mantine/core";
import { Button } from "@/components/ui/buttons/Button";
import { Icon } from "@/components";

import classes from "@/components/styles/features/time-entries/BulkActions.module.css";

interface BulkActionButtonsProps {
	selectedIds: string[];
	onBulkDelete: (ids: string[]) => void;
	onClearSelection: () => void;
}

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
					<Button variant="default" onClick={onClearSelection} fullWidth size="sm" leftSection={<Icon name="close" size={16} />}>
						Abbrechen
					</Button>
					<Button color="red" onClick={() => onBulkDelete(selectedIds)} fullWidth size="sm" leftSection={<Icon name="delete" size={16} color="white" />}>
						Löschen
					</Button>
				</Flex>
			</Flex>
		</Card>
	);
}
