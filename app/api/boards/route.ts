import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyMondayJwt } from "@/lib/monday-auth";

/**
 * GET /api/boards
 *
 * Returns the admin-enabled, admin-ordered set of boards for the runtime board
 * picker (timer/manual/edit modals). Replaces the old widget-context-derived
 * board list now that the app also runs as a workspace app (no `boardIds` in
 * context). Every signed-in user can call this — it's not admin-gated.
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

		// TODO: drop the `as any` once types/database/database.ts is regenerated for migration 033
		// (adds display_enabled/sort_order/settings, drops the six sync/budget columns referenced there).
		const { data, error } = await (supabaseAdmin.from("board_config") as any).select("board_id, sort_order, monday_board(name)").eq("display_enabled", true).order("sort_order", { ascending: true });

		if (error) {
			console.error("Error fetching display boards:", error);
			return NextResponse.json({ error: "Failed to fetch boards" }, { status: 500 });
		}

		const boards = (data || []).map((row: any) => ({
			value: row.board_id,
			label: row.monday_board?.name || row.board_id,
		}));

		return NextResponse.json({ boards });
	} catch (error) {
		console.error("Error in GET /api/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
