// app/api/tasks/details/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getItemDetails } from "@/lib/monday";

export async function GET(request: NextRequest) {
	try {
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
