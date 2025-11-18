import { NextRequest, NextResponse } from "next/server";
import { getUserTimeEntries } from "@/lib/database";
import { findOrCreateUserByMondayId, getUserProfile } from "@/lib/database/users";

export async function GET(request: NextRequest) {
	const { searchParams } = new URL(request.url);
	const mondayUserId = searchParams.get("mondayUserId");

	if (!mondayUserId) {
		return NextResponse.json({ error: "mondayUserId is required" }, { status: 400 });
	}

	try {
		// Get or create the user profile to ensure we have the Supabase user ID
		const userProfile = await getUserProfile(mondayUserId); // mondayAccountId can be empty for now

		// Fetch time entries for this user
		const timeEntries = await getUserTimeEntries(userProfile.id);

		return NextResponse.json(timeEntries);
	} catch (error) {
		console.error("Error fetching time entries:", error);
		return NextResponse.json({ error: "Failed to fetch time entries" }, { status: 500 });
	}
}
