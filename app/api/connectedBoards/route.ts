import { NextRequest, NextResponse } from "next/server";

import { getConnectedBoards } from "@/lib/monday";
import { verifyMondayJwt } from "@/lib/monday-auth";

export async function POST(req: NextRequest) {
	try {
		// Validate session
		const authHeader = req.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		const { boardIds } = await req.json();

		const boards = await getConnectedBoards(boardIds || []);

		return NextResponse.json({ boards });
	} catch (error) {
		console.error("Error in connectedBoards endpoint:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
