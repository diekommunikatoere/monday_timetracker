"use client";
import { Dropdown } from "@vibe/core/next";

export default function Home() {
	return (
		<>
			<div
				style={{
					height: "150px",
					width: "300px",
				}}
			>
				<Dropdown
					ariaLabel="Übersichts-Dropdown"
					clearAriaLabel="Löschen"
					helperText="Hilfetext"
					id="overview-dropdown"
					label="Etikett"
					options={[
						{
							label: "Option 1",
							value: 1,
						},
						{
							label: "Option 2",
							value: 2,
						},
						{
							label: "Option 3",
							value: 3,
						},
					]}
					placeholder="Platzhaltertext hier"
				/>
			</div>
		</>
	);
}
