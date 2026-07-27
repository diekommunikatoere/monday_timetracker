// Route to park a timer. This saves a timer as a draft time-entry.
import { NextRequest, NextResponse } from "next/server";

import { getUserProfileByMondayId } from "@/lib/database/users";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
	try {
		// Validate session
		const authHeader = request.headers.get("authorization");
		console.log("[API /timer/park] Received time-entry park request.");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		// Get user profile
		const userProfile = await getUserProfileByMondayId(session.userId);
		if (!userProfile) {
			return NextResponse.json({ error: "User profile not found" }, { status: 404 });
		}

		const userId = userProfile.id;

		const requestBody = await request.json().catch(() => ({}));

		const entryId = requestBody.entryId;
		if (!entryId) {
			return NextResponse.json({ error: "Missing entryId in request body" }, { status: 400 });
		}

		const entryComment = requestBody.entryComment; // Optional comment for the parked entry

		console.log("[API /timer/park] Parking timer for user:", userId, "entry:", entryId, "comment:", entryComment);

		// Call the Supabase RPC function to park the timer
		const { error: parkError } = await supabaseAdmin.rpc("timer_park", {
			p_user_id: userId,
			p_entry_id: entryId,
			p_comment: entryComment || undefined,
		});

		if (parkError) throw parkError;

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error parking timer:", error);
		return NextResponse.json({ error: "Failed to park timer" }, { status: 500 });
	}
}
