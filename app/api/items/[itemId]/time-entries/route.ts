// app/api/items/[itemId]/time-entries/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getItemTimeEntries } from "@/lib/database";
import { getItemDetails } from "@/lib/monday";

export async function GET(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
	try {
		const { itemId } = await params;
		const { searchParams } = new URL(request.url);
		let boardId = searchParams.get("boardId");
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

		return NextResponse.json({
			entries,
			aggregations: {
				totalDuration,
				byRole: Object.values(byRoleMap),
				byUser: Object.values(byUserMap),
			},
		});
	} catch (error) {
		console.error("Error in GET /api/items/[itemId]/time-entries:", error);
		return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
	}
}
