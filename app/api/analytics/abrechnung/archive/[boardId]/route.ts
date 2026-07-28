import { NextRequest, NextResponse } from "next/server";

import { getAbrechnungData } from "@/lib/abrechnung";
import { verifyMondayJwt } from "@/lib/monday-auth";

/**
 * GET /api/analytics/abrechnung/archive/[boardId]
 *
 * Rolled-up budget items for a single archived budget-board period, fetched only
 * once a year is selected from the cheap list at `GET /api/analytics/abrechnung/archive`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		const { boardId } = await params;
		if (!boardId) {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		const boards = await getAbrechnungData("archived", boardId);

		return NextResponse.json({ boards });
	} catch (error) {
		console.error("Error in GET /api/analytics/abrechnung/archive/[boardId]:", error);
		return NextResponse.json({ error: "Failed to load archived Abrechnung period" }, { status: 500 });
	}
}
