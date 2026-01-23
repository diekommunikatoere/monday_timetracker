import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isPurposeCompatible, isTimePurpose } from "@/lib/monday/utils";
import type { ColumnSyncConfigInsert, ColumnSyncConfigUpdate, SyncPurpose } from "@/types/database";

/**
 * GET /api/admin/boards/[boardId]/columns
 * Fetch all column sync configurations for a specific board
 * Note: Admin access is validated client-side via monday SDK
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const { boardId } = await params;

		const { data: columns, error } = await supabaseAdmin.from("column_sync_config").select("*").eq("board_id", boardId).order("created_at", { ascending: true });

		if (error) {
			console.error("Error fetching column sync configs:", error);
			return NextResponse.json({ error: "Failed to fetch column configurations" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			boardId,
			columns: columns || [],
			count: columns?.length || 0,
		});
	} catch (error) {
		console.error("Error in GET /api/admin/boards/[boardId]/columns:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * POST /api/admin/boards/[boardId]/columns
 * Create a new column sync configuration
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const { boardId } = await params;
		const body = await request.json();
		const { column_id, column_name, column_type, sync_purpose, time_format, include_breakdown, sync_enabled } = body;

		// Validate required fields
		if (!column_id) {
			return NextResponse.json({ error: "Column ID is required" }, { status: 400 });
		}

		if (!column_name) {
			return NextResponse.json({ error: "Column name is required" }, { status: 400 });
		}

		if (!column_type) {
			return NextResponse.json({ error: "Column type is required" }, { status: 400 });
		}

		const validPurposes: SyncPurpose[] = ["total_time", "time_by_role", "remaining_budget", "budget_used"];
		if (!sync_purpose || !validPurposes.includes(sync_purpose as SyncPurpose)) {
			return NextResponse.json({ error: `Valid sync purpose is required (${validPurposes.join(", ")})` }, { status: 400 });
		}

		// Validate column compatibility
		if (!isPurposeCompatible(column_type, sync_purpose as SyncPurpose)) {
			return NextResponse.json({ error: `Column type '${column_type}' is not compatible with purpose '${sync_purpose}'` }, { status: 400 });
		}

		// Check if this column or purpose already exists for this board
		const { data: existingColumn } = await supabaseAdmin.from("column_sync_config").select("id").eq("board_id", boardId).eq("column_id", column_id).single();

		if (existingColumn) {
			return NextResponse.json({ error: "This column is already configured for sync. Use PATCH to update." }, { status: 409 });
		}

		const { data: existingPurpose } = await supabaseAdmin.from("column_sync_config").select("id").eq("board_id", boardId).eq("sync_purpose", sync_purpose).single();

		if (existingPurpose) {
			return NextResponse.json({ error: `A column is already configured for ${sync_purpose}. Remove it first or update it.` }, { status: 409 });
		}

		// Ensure board_config exists first
		const { data: boardConfig } = await supabaseAdmin.from("board_config").select("board_id").eq("board_id", boardId).single();

		if (!boardConfig) {
			return NextResponse.json({ error: "Board configuration must be created first" }, { status: 400 });
		}

		const configData: ColumnSyncConfigInsert = {
			board_id: boardId,
			column_id,
			column_name,
			column_type,
			sync_purpose: "budget_used",
			time_format: "hours",
			include_breakdown: false,
			sync_enabled: sync_enabled !== false,
		};

		const { data: config, error } = await supabaseAdmin.from("column_sync_config").insert(configData).select().single();

		if (error) {
			console.error("Error creating column sync config:", error);
			return NextResponse.json({ error: "Failed to create column configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			config,
		});
	} catch (error) {
		console.error("Error in POST /api/admin/boards/[boardId]/columns:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * PATCH /api/admin/boards/[boardId]/columns
 * Update an existing column sync configuration
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const { boardId } = await params;
		const body = await request.json();
		const { column_id, column_name, time_format, include_breakdown, sync_enabled } = body;

		// Validate required fields
		if (!column_id) {
			return NextResponse.json({ error: "Column ID is required" }, { status: 400 });
		}

		const updateData: ColumnSyncConfigUpdate = {
			updated_at: new Date().toISOString(),
		};

		if (column_name !== undefined) updateData.column_name = column_name;

		// MON-228: We force budget_used and standard formats for new/updated configs
		updateData.sync_purpose = "budget_used";
		updateData.time_format = "hours";
		updateData.include_breakdown = false;

		if (sync_enabled !== undefined) updateData.sync_enabled = sync_enabled;

		const { data: config, error } = await supabaseAdmin.from("column_sync_config").update(updateData).eq("board_id", boardId).eq("column_id", column_id).select().single();

		if (error) {
			console.error("Error updating column sync config:", error);
			return NextResponse.json({ error: "Failed to update column configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			config,
		});
	} catch (error) {
		console.error("Error in PATCH /api/admin/boards/[boardId]/columns:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * DELETE /api/admin/boards/[boardId]/columns
 * Delete a column sync configuration
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const { boardId } = await params;
		const { searchParams } = new URL(request.url);
		const columnId = searchParams.get("columnId");

		if (!columnId) {
			return NextResponse.json({ error: "Column ID is required" }, { status: 400 });
		}

		const { error } = await supabaseAdmin.from("column_sync_config").delete().eq("board_id", boardId).eq("column_id", columnId);

		if (error) {
			console.error("Error deleting column sync config:", error);
			return NextResponse.json({ error: "Failed to delete column configuration" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			message: "Column configuration deleted",
		});
	} catch (error) {
		console.error("Error in DELETE /api/admin/boards/[boardId]/columns:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
