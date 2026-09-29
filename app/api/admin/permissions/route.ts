import { NextRequest, NextResponse } from "next/server";

import { addGrant, listGrants } from "@/lib/database/permissions";
import { getUserProfileByMondayId } from "@/lib/database/users";
import { requireAdmin } from "@/lib/monday-auth";
import { isPermissionKey } from "@/lib/permissions";

/**
 * GET /api/admin/permissions
 * All permission grants (to users and to monday teams). Admin only.
 */
export async function GET(request: NextRequest) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const grants = await listGrants();
		return NextResponse.json({ success: true, grants });
	} catch (error) {
		console.error("Error in GET /api/admin/permissions:", error);
		return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 });
	}
}

/**
 * POST /api/admin/permissions
 * Grant a permission to one user or one team: body `{ permission, userId } | { permission, teamId }`.
 * Returns the created grant; `409` if that grant already exists. Admin only.
 */
export async function POST(request: NextRequest) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const admin = await getUserProfileByMondayId(auth.userId);
		if (!admin) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		const { permission, userId, teamId } = await request.json().catch(() => ({}));

		if (!isPermissionKey(permission)) {
			return NextResponse.json({ error: "Invalid permission" }, { status: 400 });
		}

		const hasUser = typeof userId === "string" && userId.length > 0;
		const hasTeam = (typeof teamId === "string" || typeof teamId === "number") && String(teamId).length > 0;
		if (hasUser === hasTeam) {
			return NextResponse.json({ error: "Exactly one of userId or teamId is required" }, { status: 400 });
		}

		try {
			const grant = await addGrant({
				permission,
				userId: hasUser ? userId : undefined,
				teamId: hasTeam ? String(teamId) : undefined,
				createdBy: admin.id,
			});
			return NextResponse.json({ success: true, grant });
		} catch (error: any) {
			if (error?.code === "23505") {
				return NextResponse.json({ error: "Grant already exists" }, { status: 409 });
			}
			if (error?.code === "23503") {
				return NextResponse.json({ error: "Unknown user" }, { status: 400 });
			}
			throw error;
		}
	} catch (error) {
		console.error("Error in POST /api/admin/permissions:", error);
		return NextResponse.json({ error: "Failed to create permission grant" }, { status: 500 });
	}
}
