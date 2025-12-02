import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncItemColumns } from "@/lib/columnSync";

interface Props {
	params: Promise<{
		itemId: string;
	}>;
}

/**
 * POST /api/sync/item/:itemId
 * Manually trigger column sync for a specific item
 */
export async function POST(request: NextRequest, { params }: Props) {
	try {
		// Authenticate user from Monday context
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Get the Supabase user ID from the Monday user ID
		const { data: userProfile, error: userError } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();

		if (userError || !userProfile) {
			console.error("Error fetching user profile:", userError);
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		const { itemId } = await params;

		// Parse request body to get boardId
		const body = await request.json();
		const { boardId } = body;

		if (!boardId) {
			return NextResponse.json({ error: "boardId is required" }, { status: 400 });
		}

		console.log(`[ManualSync] Triggering sync for item ${itemId} on board ${boardId}`);

		// Perform the sync
		const result = await syncItemColumns(itemId, boardId, userProfile.id);

		return NextResponse.json({
			success: result.overallSuccess,
			itemId: result.itemId,
			boardId: result.boardId,
			results: result.results,
		});
	} catch (error) {
		console.error("Error in manual sync endpoint:", error);
		return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
	}
}

/**
 * GET /api/sync/item/:itemId
 * Get sync status and history for a specific item
 */
export async function GET(request: NextRequest, { params }: Props) {
	try {
		// Authenticate user from Monday context
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { itemId } = await params;
		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");
		const limit = parseInt(searchParams.get("limit") || "10", 10);

		// Build query for sync log
		let query = supabaseAdmin.from("sync_log").select("*").eq("item_id", itemId).order("created_at", { ascending: false }).limit(limit);

		if (boardId) {
			query = query.eq("board_id", boardId);
		}

		const { data, error } = await query;

		if (error) {
			console.error("Error fetching sync log:", error);
			return NextResponse.json({ error: "Failed to fetch sync history" }, { status: 500 });
		}

		return NextResponse.json({
			itemId,
			boardId,
			syncHistory: data || [],
		});
	} catch (error) {
		console.error("Error in sync status endpoint:", error);
		return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
	}
}
