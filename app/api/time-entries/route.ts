import { NextRequest, NextResponse } from "next/server";

import { getAllUserTimeEntries } from "@/lib/database";
import { getUserProfileByMondayId } from "@/lib/database/users";
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

		// Return the user's full entry history — search, filtering, and pagination
		// all run client-side (see stores/timeEntriesStore.ts +
		// components/dashboard/hooks/useFilteredTimeEntries.ts), so there are no
		// page/pageSize query params here.
		const { entries } = await getAllUserTimeEntries(userProfile.id);

		return NextResponse.json({ entries });
	} catch (error) {
		console.error("Error fetching time entries:", error);
		return NextResponse.json({ error: "Failed to fetch time entries" }, { status: 500 });
	}
}
