import { NextRequest, NextResponse } from "next/server";

import { getAuswertungData } from "@/lib/auswertung";
import { getUserProfileByMondayId } from "@/lib/database/users";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { canAccessRoute } from "@/lib/permissions";

/**
 * GET /api/analytics/auswertung?from=<ISO>&to=<ISO>
 *
 * Returns every user's tracked time for the given week, split into billable /
 * non-billable / role-less buckets plus a per-role breakdown. Read-only report;
 * see `lib/auswertung.ts` for the rollup logic.
 *
 * `from`/`to` are **required** ISO instants (unlike Abrechnung's optional range) —
 * they must be absolute instants computed client-side (there is no server-side
 * timezone; see `lib/time/calculations.ts`'s `startOfISOWeek`/`endOfISOWeek`), not
 * bare `YYYY-MM-DD` strings. An unbounded scan across every user's entire history
 * would be the most expensive query in the app, and the client always has a week
 * selected, so missing/unparseable bounds are a 400 rather than "unbounded".
 *
 * Gated the same as the `/dashboards/analytics/auswertung` page (analytics-team
 * allowlist or admin) via `lib/permissions/routes.ts` — enforced here server-side,
 * not just by `DashboardMenuButton` hiding the nav link (which Abrechnung's route
 * relies on alone today).
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

		const userProfile = await getUserProfileByMondayId(session.userId);
		const canAccess = canAccessRoute("/dashboards/analytics/auswertung", { isAdmin: session.isAdmin, teamIds: userProfile?.team_ids });
		if (!canAccess) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const fromParam = request.nextUrl.searchParams.get("from");
		const toParam = request.nextUrl.searchParams.get("to");
		const startDate = fromParam && !isNaN(new Date(fromParam).getTime()) ? fromParam : null;
		const endDate = toParam && !isNaN(new Date(toParam).getTime()) ? toParam : null;

		if (!startDate || !endDate) {
			return NextResponse.json({ error: "'from' and 'to' query parameters are required ISO instants" }, { status: 400 });
		}

		const users = await getAuswertungData({ startDate, endDate });

		return NextResponse.json({ users });
	} catch (error) {
		console.error("Error in GET /api/analytics/auswertung:", error);
		return NextResponse.json({ error: "Failed to load Auswertung data" }, { status: 500 });
	}
}
