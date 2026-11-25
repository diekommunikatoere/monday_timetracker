import { NextRequest, NextResponse } from "next/server";

import { getItemTimeEntries } from "@/lib/database";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
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

		const { itemId } = await params;
		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");
		const startDate = searchParams.get("startDate") || undefined;
		const endDate = searchParams.get("endDate") || undefined;

		/* if (!boardId) {
			return NextResponse.json({ error: "boardId is required" }, { status: 400 });
		} */

		const entries = await getItemTimeEntries(itemId, boardId, startDate, endDate);

		// Calculate aggregations
		const totalDuration = entries.reduce((sum, entry) => sum + entry.duration, 0);

		const byRoleMap: Record<string, { roleId: string; roleName: string; totalDuration: number; entryCount: number }> = {};
		const byUserMap: Record<string, { userId: string; userName: string; totalDuration: number; entryCount: number }> = {};

		entries.forEach((entry) => {
			// By Role
			const roleId = entry.role_id || "unassigned";
			const roleName = entry.role_name || "Nicht zugewiesen";
			if (!byRoleMap[roleId]) {
				byRoleMap[roleId] = { roleId, roleName, totalDuration: 0, entryCount: 0 };
			}
			byRoleMap[roleId].totalDuration += entry.duration;
			byRoleMap[roleId].entryCount += 1;

			// By User
			const userId = entry.user_id;
			const userName = (entry as any).user_name || "Unbekannter Benutzer";
			if (!byUserMap[userId]) {
				byUserMap[userId] = { userId, userName, totalDuration: 0, entryCount: 0 };
			}
			byUserMap[userId].totalDuration += entry.duration;
			byUserMap[userId].entryCount += 1;
		});

		const userIds = Object.keys(byUserMap);
		const activeByUserId = new Map<string, boolean>();
		if (userIds.length > 0) {
			const { data: profiles } = await supabaseAdmin.from("user_profiles").select("id, is_active").in("id", userIds);
			for (const profile of profiles ?? []) {
				activeByUserId.set(profile.id, profile.is_active !== false);
			}
		}

		return NextResponse.json({
			entries,
			aggregations: {
				totalDuration,
				byRole: Object.values(byRoleMap),
				byUser: Object.values(byUserMap).map((user) => ({
					...user,
					isActive: activeByUserId.get(user.userId) ?? true,
				})),
			},
		});
	} catch (error) {
		console.error("Error in GET /api/items/[itemId]/time-entries:", error);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
