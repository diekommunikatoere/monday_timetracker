// app/api/auth/monday-user/route.ts
import { NextRequest, NextResponse } from "next/server";
import { findOrCreateUserByMondayId } from "@/lib/database/users";
import { getMondayContext } from "@/lib/monday";

export async function POST(request: NextRequest) {
	try {
		const context = await getMondayContext(request);
		const { mondayUserId, mondayAccountId, email, name } = await request.json();

		if (!mondayUserId || !mondayAccountId) {
			return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
		}

		// This uses supabaseAdmin from server.ts - safe on server
		const userProfile = await findOrCreateUserByMondayId(mondayUserId, mondayAccountId, email, name);

		return NextResponse.json({ userProfile });
	} catch (error) {
		console.error("Error in monday-user API:", error);
		return NextResponse.json({ error: "Failed to authenticate user" }, { status: 500 });
	}
}
