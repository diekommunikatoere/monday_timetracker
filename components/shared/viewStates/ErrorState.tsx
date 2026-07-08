import { Button } from "@/components";
import { Flex } from "@mantine/core";

export default function ErrorState({ message }: { message: string }) {
	return (
		<Flex direction="column" align="center" justify="center" gap="lg" p="md" style={{ minHeight: "100vh", textAlign: "center" }}>
			<Flex direction="column" align="center" justify="center" gap={0}>
				<h2 className="text-lg font-semibold" style={{ color: "var(--color--error-500)", marginBottom: "0" }}>
					Och nö...
				</h2>
				<p style={{ color: "var(--color--text-primary)", textAlign: "center", maxWidth: "min(600px, 90%)" }}>{message || "Es ist ein Fehler aufgetreten. Bitte versuch die Seite neu zu laden oder kontaktiere den Support, wenn das Problem weiterhin besteht."}</p>
			</Flex>
			<Button variant="primary" onClick={() => window.location.reload()}>
				Seite neu laden
			</Button>
		</Flex>
	);
}
