import { NextRequest, NextResponse } from "next/server";

import { getAbrechnungData } from "@/lib/abrechnung";
import { verifyMondayJwt } from "@/lib/monday-auth";

/**
 * GET /api/analytics/abrechnung
 *
 * Returns the current fiscal year's budget boards, each with its budget items
 * rolled up (tracked time / cost / remaining budget across all linked job items).
 * Read-only report; see `lib/abrechnung.ts` for the rollup logic.
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

		const boards = await getAbrechnungData("active");

		return NextResponse.json({ boards });
	} catch (error) {
		console.error("Error in GET /api/analytics/abrechnung:", error);
		return NextResponse.json({ error: "Failed to load Abrechnung data" }, { status: 500 });
	}
}
