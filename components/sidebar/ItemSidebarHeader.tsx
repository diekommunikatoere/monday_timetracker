// components/sidebar/ItemSidebarHeader.tsx
// Top bar of the monday item-sidebar widget: brand logo + "add time" button.
"use client";

import { Flex, Tooltip } from "@mantine/core";
import { Logo, Button, Icon } from "@/components";
import { useUserStore } from "@/stores/userStore";
import { APP_VERSION } from "@/lib/version";

/**
 * Props for {@link ItemSidebarHeader}.
 *
 * @property onManualEntryClick - Fired when the user clicks the "Zeit eintragen" button; the parent opens {@link ItemManualEntryModal}.
 */
export interface ItemSidebarHeaderProps {
	onManualEntryClick: () => void;
}

/**
 * Header rendered at the top of the monday item sidebar.
 *
 * Reads `appTheme` from `useUserStore` to pick the correct `Logo` variant
 * (`"brand"` on the light theme, `"light"` otherwise) so the logo stays legible
 * against monday's theme. Renders the DKI `Logo` on the left and a primary
 * `Button` labelled "Zeit eintragen" on the right that delegates to the parent
 * via `onManualEntryClick`.
 *
 * @param props - Component props.
 * @returns A `<header>` containing the logo and add-time button.
 */
export function ItemSidebarHeader({ onManualEntryClick }: ItemSidebarHeaderProps) {
	const appTheme = useUserStore((state) => state.appTheme);

	const logoStyle = appTheme === "light" ? "brand" : "light";

	return (
		<header>
			<Flex justify="space-between" align="center" p="sm">
				<Tooltip label={`v${APP_VERSION}`} position="bottom">
					<Logo size={{ height: 24 }} style={logoStyle} loading="eager" />
				</Tooltip>
				<Button leftSection={<Icon name="add" size={21} color="var(--color--icon-on-primary)" weight="bold" />} onClick={onManualEntryClick}>
					Zeit eintragen
				</Button>
			</Flex>
		</header>
	);
}
