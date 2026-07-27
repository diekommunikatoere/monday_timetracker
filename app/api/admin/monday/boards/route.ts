import { NextRequest, NextResponse } from "next/server";

import { getAllBoardsGroupedByWorkspace } from "@/lib/monday";
import { requireAdmin } from "@/lib/monday-auth";

/**
 * GET /api/admin/monday/boards
 * Fetch all active boards across all workspaces, grouped by workspace, for the
 * admin "Boards verwalten" picker.
 * Note: Authentication is handled server-side via requireAdmin
 */
export async function GET(request: NextRequest) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const groups = await getAllBoardsGroupedByWorkspace();

		return NextResponse.json({
			success: true,
			groups,
		});
	} catch (error) {
		console.error("Error in GET /api/admin/monday/boards:", error);
		return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
	}
}
