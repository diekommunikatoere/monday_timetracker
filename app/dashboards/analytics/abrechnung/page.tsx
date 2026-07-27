import Link from "next/link";

export default function AbrechnungPage() {
	console.log("AbrechnungPage: Rendering Abrechnung page");
	return (
		<div>
			<h1>Abrechnung</h1>
			<p>Dies ist die Abrechnungsseite.</p>
			<Link href="/dashboards" style={{ textDecoration: "none", color: "inherit" }}>
				Zurück zum Dashboard
			</Link>
		</div>
	);
}
