"use client";

import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@/public/css/mondayThemeMapping.css";
import "@/public/css/light.css";
import "@/public/css/dark.css";
import "@/public/css/fonts.css";
import "./globals.scss";
import { themeTokens } from "@/components/ui/theme/tokens";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@/components/ToastProvider";
import { StoreProvider } from "@/components/StoreProvider";
import { TimerProvider } from "@/components/features/timer/TimerProvider";
import { createTheme, MantineProvider, ColorSchemeScript, colorsTuple } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { useUserStore } from "@/stores/userStore";

const theme = createTheme({
	colors: {
		"dki-black": colorsTuple("#282616"),
		"dki-primary": ["#ffe8f9", "#ffcfeb", "#ff9cd3", "#fe65ba", "#fd39a5", "#fd1f98", "#fe1092", "#db007a", "#cb0070", "#b20061"],
		"dki-secondary": ["#fffbe0", "#fff5ca", "#ffea99", "#ffde63", "#ffd640", "#ffcd18", "#ffca01", "#e3b200", "#ca9e00", "#af8800"],
		"dki-tertiary": colorsTuple("#92907b"),
		"dki-tertiary-dark": colorsTuple("#62604a"),
		"dki-tertiary-light": colorsTuple("#d1d0c7"),
		"dki-success": ["#e4ffee", "#d2f9e1", "#a8f0c3", "#7be7a3", "#4ade80", "#3cdb76", "#2bd96c", "#1ac05b", "#0aab4f", "#009440"],
		"dki-error": ["#ffe8ed", "#ffd0d8", "#fba0ae", "#f76c81", "#f4415b", "#f32643", "#f31b3b", "#d80629", "#c20023", "#aa001c"],
	},
	primaryColor: "dki-primary",
	primaryShade: 7,
	black: "#282616",
	white: "#ffffff",
	other: {},
});

const queryClient = new QueryClient();

export default function RootLayout({ children }: { children: React.ReactNode }) {
	const appTheme = useUserStore((state) => state.appTheme);

	return (
		<html lang="de" suppressHydrationWarning>
			<head>
				<ColorSchemeScript />
			</head>
			<body>
				<MantineProvider theme={theme} cssVariablesResolver={themeTokens} forceColorScheme={appTheme}>
					<Notifications />
					<QueryClientProvider client={queryClient}>
						<StoreProvider>
							<TimerProvider>
								<ToastProvider>{children}</ToastProvider>
							</TimerProvider>
						</StoreProvider>
					</QueryClientProvider>
				</MantineProvider>
			</body>
		</html>
	);
}
