import { NextRequest, NextResponse } from "next/server";
import { togglePause } from "@/lib/database";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { userId, elapsedTime, isPausing } = body;

		// Validate required fields
		if (!userId) {
			return NextResponse.json({ error: "userId is required" }, { status: 400 });
		}

		if (typeof elapsedTime !== "number") {
			return NextResponse.json({ error: "elapsedTime must be a number" }, { status: 400 });
		}

		if (typeof isPausing !== "boolean") {
			return NextResponse.json({ error: "isPausing must be a boolean" }, { status: 400 });
		}

		// Call the database function to toggle pause/resume
		const updatedSession = await togglePause(userId, elapsedTime, isPausing);

		return NextResponse.json({ session: updatedSession });
	} catch (error) {
		console.error("Error toggling pause:", error);
		return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to toggle pause" }, { status: 500 });
	}
}
