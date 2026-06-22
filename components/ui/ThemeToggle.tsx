// components/ui/ThemeToggle.tsx
// Theme toggle button that flips between light and dark app themes via the user store.

"use client";

import { Tooltip } from "@mantine/core";
import { useUserStore } from "@/stores/userStore";
import { IconButton } from "@/components";
import LightIcon from "@/components/icons/Light";
import DarkIcon from "@/components/icons/Dark";

/**
 * Small icon button that switches the global app theme between light and dark.
 *
 * Reads `appTheme` and `toggleTheme` from {@link useUserStore} and renders a
 * {@link IconButton} wrapped in a Mantine `Tooltip`. The icon and localized
 * tooltip/`aria-label` swap depending on the current theme: when light is
 * active it offers "Zu Dark Mode wechseln", otherwise "Zu Light Mode wechseln".
 * The icon color is pinned to `var(--color--primary)` regardless of theme.
 *
 * @returns A themed {@link IconButton} (with tooltip) that toggles the color scheme.
 */
export function ThemeToggle() {
	const appTheme = useUserStore((state) => state.appTheme);
	const toggleTheme = useUserStore((state) => state.toggleTheme);

	return (
		<Tooltip label={appTheme === "light" ? "Zu Dark Mode wechseln" : "Zu Light Mode wechseln"} position="top" withArrow>
			<IconButton onClick={() => toggleTheme()} variant="filled" colorVariant="primary-muted" size="lg" aria-label={appTheme === "light" ? "Zu Dark Mode wechseln" : "Zu Light Mode wechseln"}>
				{appTheme === "light" ? <LightIcon size={20} color="var(--color--primary)" /> : <DarkIcon size={20} color="var(--color--primary)" />}
			</IconButton>
		</Tooltip>
	);
}
