import { NextRequest, NextResponse } from "next/server";

import { getAbrechnungData } from "@/lib/abrechnung";
import { verifyMondayJwt } from "@/lib/monday-auth";

/**
 * GET /api/analytics/abrechnung?from=<ISO>&to=<ISO>&refresh=1
 *
 * Returns the current fiscal year's budget boards, each with its budget items
 * rolled up (tracked time / cost / remaining budget across all linked job items).
 * Read-only report; see `lib/abrechnung.ts` for the rollup logic.
 *
 * `from`/`to` are optional ISO instants (see `AbrechnungDateRange`) that narrow the
 * rollup to that range — the Abrechnung toolbar's "Zeitraum" filter. They must be
 * absolute instants computed client-side (there is no server-side timezone; see
 * `lib/time/calculations.ts`), not bare `YYYY-MM-DD` strings. Unparseable or missing
 * values are silently treated as unbounded on that side rather than erroring, since
 * an all-time rollup is a safe default.
 *
 * `refresh=1` bypasses `getBudgetBoardItems`'s Redis cache (see `lib/monday.ts`) and
 * rewrites it — the toolbar's "Aktualisieren" button, for when a budget/status value was
 * just edited directly in monday and the cache's TTL hasn't lapsed yet.
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

		const fromParam = request.nextUrl.searchParams.get("from");
		const toParam = request.nextUrl.searchParams.get("to");
		const startDate = fromParam && !isNaN(new Date(fromParam).getTime()) ? fromParam : null;
		const endDate = toParam && !isNaN(new Date(toParam).getTime()) ? toParam : null;
		const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

		const boards = await getAbrechnungData("active", undefined, { startDate, endDate }, forceRefresh);

		return NextResponse.json({ boards });
	} catch (error) {
		console.error("Error in GET /api/analytics/abrechnung:", error);
		return NextResponse.json({ error: "Failed to load Abrechnung data" }, { status: 500 });
	}
}
