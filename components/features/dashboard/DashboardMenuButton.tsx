"use client";

import { Flex, Menu, Indicator } from "@mantine/core";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, IconButton } from "@/components";
import { canAccessRoute } from "@/lib/permissions";
import { useUserStore } from "@/stores/userStore";

export function DashboardMenuButton() {
	const supabaseUser = useUserStore((state) => state.supabaseUser);
	const user = { teamIds: supabaseUser?.team_ids, isAdmin: supabaseUser?.is_admin };
	const appTheme = useUserStore((state) => state.appTheme);
	const setTheme = useUserStore((state) => state.setTheme);
	const pathname = usePathname();

	const setView = (view: "time-entries" | "abrechnung" | "auswertung") => {
		console.log(`Switching to view: ${view}`);
	};

	const renderViewLink = (label: string, path: string, icon: string) => {
		const isActive = pathname === path;
		console.log(`Rendering link for ${label} (${path}), isActive: ${isActive}`);

		if (!canAccessRoute(path, user)) {
			console.warn(`User does not have access to ${path}. Link will not be rendered.`);
			return null;
		}

		return (
			<Menu.Item>
				<Indicator position="middle-end" size={8} disabled={!isActive}>
					<Link href={path} style={{ textDecoration: "none", color: "inherit" }}>
						<Flex align="center" gap={8}>
							<Icon name={icon} size={16} />
							{label}
						</Flex>
					</Link>
				</Indicator>
			</Menu.Item>
		);
	};

	return (
		<Menu shadow="md" width={200} position="bottom-start" transitionProps={{ transition: "pop-top-left", duration: 200 }}>
			<Menu.Target>
				<IconButton size="lg" variant="subtle">
					<Icon name="menu" size={24} />
				</IconButton>
			</Menu.Target>
			<Menu.Dropdown>
				{renderViewLink("Zeiterfassung", "/dashboards", "home")}
				{renderViewLink("Abrechnung", "/dashboards/analytics/abrechnung", "receipt_long")}
				{renderViewLink("Auswertung", "/dashboards/analytics/auswertung", "bar_chart")}
				<Menu.Divider />
				<Menu.Sub>
					<Menu.Sub.Target>
						<Menu.Sub.Item>Darstellung</Menu.Sub.Item>
					</Menu.Sub.Target>

					<Menu.Sub.Dropdown>
						<Menu.RadioGroup value={appTheme} onChange={(value) => setTheme(value as "light" | "dark")}>
							<Menu.RadioItem value="light" checkIcon={<Icon name="check" size={16} color="var(--color--primary-500)" />}>
								<Flex align="center" gap={8}>
									<Icon name="light_mode" size={16} />
									Hell
								</Flex>
							</Menu.RadioItem>
							<Menu.RadioItem value="dark" checkIcon={<Icon name="check" size={16} color="var(--color--primary-500)" />}>
								<Flex align="center" gap={8}>
									<Icon name="dark_mode" size={16} />
									Dunkel
								</Flex>
							</Menu.RadioItem>
						</Menu.RadioGroup>
					</Menu.Sub.Dropdown>
				</Menu.Sub>
			</Menu.Dropdown>
		</Menu>
	);
}

export default DashboardMenuButton;
