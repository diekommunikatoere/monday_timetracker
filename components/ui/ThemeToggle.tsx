// components/ui/ThemeToggle.tsx
// Theme toggle button that flips between light and dark app themes via the user store.

"use client";

import { Tooltip } from "@mantine/core";
import { useUserStore } from "@/stores/userStore";
import { Icon, IconButton } from "@/components";

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
	const toggleTheme = useUserStore((state) => state.setTheme);

	return (
		<Tooltip label={appTheme === "light" ? "Zu Dark Mode wechseln" : "Zu Light Mode wechseln"} position="top" withArrow>
			<IconButton onClick={() => toggleTheme(appTheme === "light" ? "dark" : "light")} variant="filled" colorVariant="primary-muted" size="lg" aria-label={appTheme === "light" ? "Zu Dark Mode wechseln" : "Zu Light Mode wechseln"}>
				<Icon name={appTheme === "light" ? "light_mode" : "dark_mode"} size={18} />
			</IconButton>
		</Tooltip>
	);
}
