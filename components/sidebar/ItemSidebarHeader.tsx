// components/sidebar/ItemSidebarHeader.tsx
"use client";

import { Flex, Text, Group } from "@mantine/core";
import { Logo } from "@/components";
import { formatDuration } from "@/lib/utils";

export interface ItemSidebarHeaderProps {
	itemName: string;
	totalDuration: number;
}

export function ItemSidebarHeader({ itemName, totalDuration }: ItemSidebarHeaderProps) {
	return (
		<header style={{ padding: "16px", borderBottom: "1px solid var(--color--ui-border)" }}>
			<Flex justify="space-between" align="center">
				<Flex align="center" gap="md">
					<Logo size={{ width: 120, height: 24 }} style="brand" />
					<Text fw={700} size="lg">
						{itemName}
					</Text>
				</Flex>
				<Group gap="xs">
					<Text size="sm" c="dimmed">
						Gesamtzeit:
					</Text>
					<Text fw={700} size="md">
						{formatDuration(totalDuration)}
					</Text>
				</Group>
			</Flex>
		</header>
	);
}
