import { NextRequest, NextResponse } from "next/server";

import { getItemDetails } from "@/lib/monday";
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

		const { searchParams } = new URL(request.url);
		const itemId = searchParams.get("itemId");

		if (!itemId) {
			return NextResponse.json({ error: "itemId is required" }, { status: 400 });
		}

		const details = await getItemDetails(itemId);

		if (!details) {
			return NextResponse.json({ error: "Item not found" }, { status: 404 });
		}

		return NextResponse.json(details);
	} catch (error) {
		console.error("Error in GET /api/tasks/details:", error);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
