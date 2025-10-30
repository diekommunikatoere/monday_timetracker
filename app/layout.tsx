import type { Metadata } from "next";
import "./globals.scss";

export const metadata: Metadata = {
	title: "Time Tracker",
	description: "A simple time tracking application",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
