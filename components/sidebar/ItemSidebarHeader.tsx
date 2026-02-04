// components/sidebar/ItemSidebarHeader.tsx
"use client";

import { Flex } from "@mantine/core";
import { Logo, Button, Icon } from "@/components";
import { useUserStore } from "@/stores/userStore";

export interface ItemSidebarHeaderProps {
	onManualEntryClick: () => void;
}

export function ItemSidebarHeader({ onManualEntryClick }: ItemSidebarHeaderProps) {
	const appTheme = useUserStore((state) => state.appTheme);

	const logoStyle = appTheme === "light" ? "brand" : "light";

	return (
		<header style={{ borderBottom: "1px solid var(--color--border-ui)" }}>
			<Flex justify="space-between" align="center" p="sm">
				<Logo size={{ width: 120, height: 24 }} style={logoStyle} />
				<Button leftSection={<Icon name="add" size={18} color="var(--color--text-on-primary)" weight="bold" />} onClick={onManualEntryClick}>
					Zeit eintragen
				</Button>
			</Flex>
		</header>
	);
}
