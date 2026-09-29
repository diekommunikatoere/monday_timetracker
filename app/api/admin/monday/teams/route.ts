import { NextRequest, NextResponse } from "next/server";

import { getTeams } from "@/lib/monday";
import { requireAdmin } from "@/lib/monday-auth";

/**
 * GET /api/admin/monday/teams
 * All teams of the monday account (id + name + picture), for the permission-grant team picker.
 * Admin only. Returns `[]` (not an error) when the monday API is unavailable so the UI can
 * fall back to showing raw team ids.
 */
export async function GET(request: NextRequest) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const teams = await getTeams();
		return NextResponse.json({ success: true, teams });
	} catch (error) {
		console.error("Error in GET /api/admin/monday/teams:", error);
		return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
	}
}
