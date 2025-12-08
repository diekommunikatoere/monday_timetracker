// components/dashboard/BulkActionButtons.tsx
"use client";

import { Card, Flex, Text } from "@mantine/core";
import { Button } from "@/components/ui/buttons/Button";
import { Icon } from "@/components/Icon";

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
		<Card
			shadow="lg"
			padding="md"
			radius="md"
			withBorder
			style={{
				position: "fixed",
				bottom: "2rem",
				left: "50%",
				transform: "translateX(-50%)",
				zIndex: 1000,
				minWidth: "300px",
				width: "auto",
				animation: "slideUp 0.3s ease-out",
			}}
		>
			<style jsx global>{`
				@keyframes slideUp {
					from {
						transform: translateX(-50%) translateY(100px);
						opacity: 0;
					}
					to {
						transform: translateX(-50%) translateY(0);
						opacity: 1;
					}
				}
			`}</style>

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
