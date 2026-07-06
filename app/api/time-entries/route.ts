import { NextRequest, NextResponse } from "next/server";
import { getUserTimeEntries } from "@/lib/database";
import { getUserProfileByMondayId } from "@/lib/database/users";
import { verifyMondayJwt } from "@/lib/monday-auth";

/** Allowed page sizes — mirrors the dashboard's page-size picker. */
const ALLOWED_PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

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

		// Parse and clamp pagination params server-side — this is a public HTTP
		// surface, don't trust the client's page/pageSize values.
		const { searchParams } = new URL(request.url);
		const requestedPageSize = Number(searchParams.get("pageSize"));
		const pageSize = ALLOWED_PAGE_SIZES.includes(requestedPageSize) ? requestedPageSize : DEFAULT_PAGE_SIZE;
		const requestedPage = Number(searchParams.get("page"));
		const page = Math.max(1, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1);

		// Fetch time entries for this user using the internal Supabase ID
		const { entries, total } = await getUserTimeEntries(userProfile.id, { page, pageSize });

		return NextResponse.json({ entries, total, page, pageSize });
	} catch (error) {
		console.error("Error fetching time entries:", error);
		return NextResponse.json({ error: "Failed to fetch time entries" }, { status: 500 });
	}
}
