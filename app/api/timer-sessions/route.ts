import { NextResponse } from "next/server";
import { getCurrentTimerSession, upsertTimerSession, clearTimerSession } from "@/lib/database";
import type { Database } from "@/types/database";

type TimerSessionInsert = Database["public"]["Tables"]["timer_session"]["Insert"];

export async function GET(request: Request) {
	try {
		// Extract user_id from auth or query params (implement auth as needed)
		const url = new URL(request.url);
		const userId = url.searchParams.get("user_id");
		if (!userId) {
			return NextResponse.json({ error: "user_id is required" }, { status: 400 });
		}

		const session = await getCurrentTimerSession(userId);
		return NextResponse.json({ session });
	} catch (error) {
		console.error("Error fetching timer session:", error);
		return NextResponse.json({ error: "Failed to fetch timer session" }, { status: 500 });
	}
}

export async function POST(request: Request) {
	try {
		const sessionData: Partial<TimerSessionInsert> = await request.json();

		// Validate required fields
		if (!sessionData.user_id) {
			return NextResponse.json({ error: "user_id is required" }, { status: 400 });
		}

		const session = await upsertTimerSession(sessionData, sessionData.user_id);
		return NextResponse.json({ session });
	} catch (error) {
		console.error("Error creating/updating timer session:", error);
		return NextResponse.json({ error: "Failed to create/update timer session" }, { status: 500 });
	}
}

export async function DELETE(request: Request) {
	try {
		// Extract user_id from auth or query params
		const url = new URL(request.url);
		const userId = url.searchParams.get("user_id");
		if (!userId) {
			return NextResponse.json({ error: "user_id is required" }, { status: 400 });
		}

		await clearTimerSession(userId);
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error clearing timer session:", error);
		return NextResponse.json({ error: "Failed to clear timer session" }, { status: 500 });
	}
}
