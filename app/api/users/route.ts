import { NextRequest, NextResponse } from "next/server";

import { hasPermission, listAccountUsers } from "@/lib/database/permissions";
import { getUserProfileByMondayId } from "@/lib/database/users";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { PERMISSIONS } from "@/lib/permissions";

/**
 * GET /api/users
 *
 * Users of the caller's monday account (from `user_profiles`, never the monday API), for the
 * user pickers: booking/reassigning time entries and the admin permission grants. Requires
 * `time_entries.manage_others` (monday admins implicitly hold it).
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
		if (!userProfile) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		if (!(await hasPermission(userProfile, session.isAdmin, PERMISSIONS.MANAGE_OTHERS_ENTRIES))) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const users = await listAccountUsers(session.accountId);
		return NextResponse.json({ success: true, users });
	} catch (error) {
		console.error("Error in GET /api/users:", error);
		return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
	}
}
