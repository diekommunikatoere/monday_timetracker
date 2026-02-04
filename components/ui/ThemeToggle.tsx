"use client";

import { Tooltip } from "@mantine/core";
import { useUserStore } from "@/stores/userStore";
import { Icon, IconButton } from "@/components";
import LightIcon from "@/components/icons/Light";
import DarkIcon from "@/components/icons/Dark";

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
