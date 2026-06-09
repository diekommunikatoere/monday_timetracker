"use client";

import { Tooltip } from "@mantine/core";
import { useUserStore } from "@/stores/userStore";
import { Icon, IconButton } from "@/components";

export function ThemeToggle() {
    const appTheme = useUserStore((state) => state.appTheme);
    const toggleTheme = useUserStore((state) => state.toggleTheme);

    return (
        <Tooltip
            label={appTheme === "light" ? "Zu Dark Mode wechseln" : "Zu Light Mode wechseln"}
            position="top"
            withArrow
        >
            <IconButton
                onClick={() => toggleTheme()}
                variant="primary-muted"
                size="lg"
                aria-label={appTheme === "light" ? "Zu Dark Mode wechseln" : "Zu Light Mode wechseln"}
            >
                <Icon
                    name={appTheme === "light" ? "light" : "dark"}
                    size={20}
                    color="var(--color--text-on-primary-muted)"
                />
            </IconButton>
        </Tooltip>
    );
}
