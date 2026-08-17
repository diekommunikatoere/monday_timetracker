import { NextRequest, NextResponse } from "next/server";

import { refreshBudgetItem } from "@/lib/abrechnung";
import { verifyMondayJwt } from "@/lib/monday-auth";

/**
 * GET /api/analytics/abrechnung/item?boardId=<id>&itemId=<id>&from=<ISO>&to=<ISO>
 *
 * Refreshes a single budget item — the Abrechnung table's per-row "Aktualisieren" action.
 * Re-fetches just this item from monday (bypassing `getBudgetBoardItems`'s cache for it)
 * and re-runs its rollup, without touching the rest of the board. See `refreshBudgetItem`
 * in `lib/abrechnung.ts`.
 *
 * `from`/`to` mirror `GET /api/analytics/abrechnung`'s "Zeitraum" params, so a refresh
 * triggered while a date range is active narrows to the same range.
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

		const boardId = request.nextUrl.searchParams.get("boardId");
		const itemId = request.nextUrl.searchParams.get("itemId");
		if (!boardId || !itemId) {
			return NextResponse.json({ error: "boardId and itemId are required" }, { status: 400 });
		}

		const fromParam = request.nextUrl.searchParams.get("from");
		const toParam = request.nextUrl.searchParams.get("to");
		const startDate = fromParam && !isNaN(new Date(fromParam).getTime()) ? fromParam : null;
		const endDate = toParam && !isNaN(new Date(toParam).getTime()) ? toParam : null;

		const item = await refreshBudgetItem(boardId, itemId, { startDate, endDate });
		if (!item) {
			return NextResponse.json({ error: "Budget item not found" }, { status: 404 });
		}

		return NextResponse.json({ item });
	} catch (error) {
		console.error("Error in GET /api/analytics/abrechnung/item:", error);
		return NextResponse.json({ error: "Failed to refresh budget item" }, { status: 500 });
	}
}
