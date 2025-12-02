import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { BoardConfigInsert, BoardConfigUpdate } from "@/types/database";

/**
 * GET /api/admin/boards
 * Fetch all board configurations
 * Note: Admin access is validated client-side via monday SDK
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");

		let query = supabaseAdmin.from("board_config").select("*").order("board_name", { ascending: true });

		if (boardId) {
			query = query.eq("board_id", boardId);
		}

		const { data: boards, error } = await query;

		if (error) {
			console.error("Error fetching board configs:", error);
			return NextResponse.json({ error: "Failed to fetch board configurations" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			boards: boards || [],
			count: boards?.length || 0,
		});
	} catch (error) {
		console.error("Error in GET /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * POST /api/admin/boards
 * Create or update a board configuration (upsert)
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { board_id, board_name, sync_enabled, budget_column_id, budget_column_type, currency_symbol, sync_on_finalize, sync_total_time, sync_time_by_role, sync_remaining_budget } = body;

		// Validate required fields
		if (!board_id || typeof board_id !== "string") {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		if (!board_name || typeof board_name !== "string") {
			return NextResponse.json({ error: "Board name is required" }, { status: 400 });
		}

		const boardData: BoardConfigInsert = {
			board_id,
			board_name: board_name.trim(),
			sync_enabled: sync_enabled !== false, // Default to true
			budget_column_id: budget_column_id || null,
			budget_column_type: budget_column_type || null,
			currency_symbol: currency_symbol || "€",
			sync_on_finalize: sync_on_finalize !== false,
			sync_total_time: sync_total_time !== false,
			sync_time_by_role: sync_time_by_role === true,
			sync_remaining_budget: sync_remaining_budget === true,
		};

		// Upsert - update if exists, insert if not
		const { data: board, error } = await supabaseAdmin.from("board_config").upsert(boardData, { onConflict: "board_id" }).select().single();

		if (error) {
			console.error("Error creating/updating board config:", error);
			return NextResponse.json({ error: "Failed to save board configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			board,
		});
	} catch (error) {
		console.error("Error in POST /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * PATCH /api/admin/boards
 * Update an existing board configuration
 */
export async function PATCH(request: NextRequest) {
	try {
		const body = await request.json();
		const { board_id, board_name, sync_enabled, budget_column_id, budget_column_type, currency_symbol, sync_on_finalize, sync_total_time, sync_time_by_role, sync_remaining_budget } = body;

		// Validate required fields
		if (!board_id) {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		const updateData: BoardConfigUpdate = {
			updated_at: new Date().toISOString(),
		};

		if (board_name !== undefined) updateData.board_name = board_name.trim();
		if (sync_enabled !== undefined) updateData.sync_enabled = sync_enabled;
		if (budget_column_id !== undefined) updateData.budget_column_id = budget_column_id || null;
		if (budget_column_type !== undefined) updateData.budget_column_type = budget_column_type || null;
		if (currency_symbol !== undefined) updateData.currency_symbol = currency_symbol;
		if (sync_on_finalize !== undefined) updateData.sync_on_finalize = sync_on_finalize;
		if (sync_total_time !== undefined) updateData.sync_total_time = sync_total_time;
		if (sync_time_by_role !== undefined) updateData.sync_time_by_role = sync_time_by_role;
		if (sync_remaining_budget !== undefined) updateData.sync_remaining_budget = sync_remaining_budget;

		const { data: board, error } = await supabaseAdmin.from("board_config").update(updateData).eq("board_id", board_id).select().single();

		if (error) {
			console.error("Error updating board config:", error);
			return NextResponse.json({ error: "Failed to update board configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			board,
		});
	} catch (error) {
		console.error("Error in PATCH /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * DELETE /api/admin/boards
 * Delete a board configuration
 */
export async function DELETE(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");

		if (!boardId) {
			return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
		}

		// Delete related records first (cascading)
		await supabaseAdmin.from("column_sync_config").delete().eq("board_id", boardId);
		await supabaseAdmin.from("board_role_override").delete().eq("board_id", boardId);

		const { error } = await supabaseAdmin.from("board_config").delete().eq("board_id", boardId);

		if (error) {
			console.error("Error deleting board config:", error);
			return NextResponse.json({ error: "Failed to delete board configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			message: "Board configuration deleted",
		});
	} catch (error) {
		console.error("Error in DELETE /api/admin/boards:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
