import { NextRequest, NextResponse } from "next/server";

import { getArchivedBudgetBoards } from "@/lib/abrechnung";
import { verifyMondayJwt } from "@/lib/monday-auth";

/**
 * GET /api/analytics/abrechnung/archive
 *
 * Cheap "pick a year" list of archived budget-board periods — no monday API calls.
 * Backs the Abrechnung page's Archiv section; a specific period's rolled-up data is
 * fetched only once selected, via `GET /api/analytics/abrechnung/archive/[boardId]`.
 */
export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		const periods = await getArchivedBudgetBoards();

		return NextResponse.json({ periods });
	} catch (error) {
		console.error("Error in GET /api/analytics/abrechnung/archive:", error);
		return NextResponse.json({ error: "Failed to load archived Abrechnung periods" }, { status: 500 });
	}
}
