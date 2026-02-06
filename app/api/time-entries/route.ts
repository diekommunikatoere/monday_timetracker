import { NextRequest, NextResponse } from "next/server";
import { getUserTimeEntries } from "@/lib/database";
import { findOrCreateUserByMondayId, getUserProfileByMondayId } from "@/lib/database/users";
import { verifyMondayJwt } from "@/lib/monday-auth";

export async function GET(request: NextRequest) {
	try {
		// Validate session
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		// Get the user profile using the Monday ID from the JWT
		const userProfile = await getUserProfileByMondayId(session.userId);

		if (!userProfile) {
			return NextResponse.json({ error: "User profile not found" }, { status: 404 });
		}

		// Fetch time entries for this user using the internal Supabase ID
		const timeEntries = await getUserTimeEntries(userProfile.id);

		return NextResponse.json(timeEntries);
	} catch (error) {
		console.error("Error fetching time entries:", error);
		return NextResponse.json({ error: "Failed to fetch time entries" }, { status: 500 });
	}
}
