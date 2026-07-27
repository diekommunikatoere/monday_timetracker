import Link from "next/link";

export default function AuswertungPage() {
	console.log("AuswertungPage: Rendering Auswertung page");
	return (
		<div>
			<h1>Auswertung</h1>
			<p>Dies ist die Auswertungsseite.</p>
			<Link href="/dashboards" style={{ textDecoration: "none", color: "inherit" }}>
				Zurück zum Dashboard
			</Link>
		</div>
	);
}
