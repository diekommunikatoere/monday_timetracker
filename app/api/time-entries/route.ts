import { NextResponse } from "next/server";
import { getAllTimeEntries } from "@/lib/database";

export async function GET() {
	try {
		const entries = getAllTimeEntries.all();
		return NextResponse.json(entries);
	} catch (error) {
		console.error("Error fetching time entries:", error);
		return NextResponse.json({ error: "Failed to fetch time entries" }, { status: 500 });
	}
}
