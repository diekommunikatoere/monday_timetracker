// app/api/auth/monday-user/route.ts
import { NextRequest, NextResponse } from "next/server";

import { findOrCreateUserByMondayId } from "@/lib/database/users";
import { getUserDetails } from "@/lib/monday";
import { verifyMondayJwt } from "@/lib/monday-auth";

export async function POST(request: NextRequest) {
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

		// Fetch user's details (name, email, teams, photos) from Monday directly —
		// avoids relying on the deprecated client-side `monday.api()` GraphQL call.
		const { name, email, teams, photo_urls } = await getUserDetails(session.userId);
		const teamIds = teams.map((team) => team.id);

		// This uses supabaseAdmin from server.ts - safe on server
		const userProfile = await findOrCreateUserByMondayId(session.userId, session.accountId, email, name, teamIds, photo_urls, session.isAdmin);

		return NextResponse.json({ userProfile, mondayUser: { name, email, photo_urls } });
	} catch (error) {
		console.error("Error in monday-user API:", error);
		return NextResponse.json({ error: "Failed to authenticate user" }, { status: 500 });
	}
}
