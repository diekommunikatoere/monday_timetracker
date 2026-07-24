"use client";

import { Icon, IconButton } from "@/components";
import { Flex, Menu, Indicator } from "@mantine/core";
import { useUserStore } from "@/stores/userStore";

export function DashboardMenuButton() {
	const appTheme = useUserStore((state) => state.appTheme);
	const setTheme = useUserStore((state) => state.setTheme);

	const setView = (view: "billing" | "analytics") => {
		console.log(`Switching to view: ${view}`);
	};

	return (
		<Menu shadow="md" width={200} position="bottom-start" transitionProps={{ transition: "pop-top-left", duration: 200 }}>
			<Menu.Target>
				<IconButton size="lg" variant="subtle">
					<Icon name="menu" size={24} />
				</IconButton>
			</Menu.Target>
			<Menu.Dropdown>
				<Menu.Item>
					<Indicator position="middle-end" size={8}>
						<Flex align="center" gap={8}>
							<Icon name="home" size={16} />
							Zeiterfassung
						</Flex>
					</Indicator>
				</Menu.Item>
				<Menu.Item onClick={() => setView("billing")}>
					<Flex align="center" gap={8}>
						<Icon name="receipt_long" size={16} />
						Abrechnung
					</Flex>
				</Menu.Item>
				<Menu.Item onClick={() => setView("analytics")}>
					<Flex align="center" gap={8}>
						<Icon name="bar_chart" size={16} />
						Auswertung
					</Flex>
				</Menu.Item>
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
