import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { BoardRoleOverrideInsert, BoardRoleOverrideUpdate } from "@/types/database";

/**
 * GET /api/admin/boards/[boardId]/role-overrides
 * Fetch all role overrides for a specific board
 * Note: Admin access is validated client-side via monday SDK
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const { boardId } = await params;

		// Fetch role overrides with role details
		const { data: overrides, error } = await supabaseAdmin
			.from("board_role_override")
			.select(
				`
				*,
				role:role_id (
					id,
					name,
					description,
					hourly_rate,
					is_active,
					color_hex
				)
			`
			)
			.eq("board_id", boardId)
			.order("created_at", { ascending: true });

		if (error) {
			console.error("Error fetching role overrides:", error);
			return NextResponse.json({ error: "Failed to fetch role overrides" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			boardId,
			overrides: overrides || [],
			count: overrides?.length || 0,
		});
	} catch (error) {
		console.error("Error in GET /api/admin/boards/[boardId]/role-overrides:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * POST /api/admin/boards/[boardId]/role-overrides
 * Create a new role override for a board
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const { boardId } = await params;
		const body = await request.json();
		const { role_id, hourly_rate, is_enabled } = body;

		// Validate required fields
		if (!role_id) {
			return NextResponse.json({ error: "Role ID is required" }, { status: 400 });
		}

		if (typeof hourly_rate !== "number" || hourly_rate < 0) {
			return NextResponse.json({ error: "Valid hourly rate is required" }, { status: 400 });
		}

		// Check if override already exists
		const { data: existing } = await supabaseAdmin.from("board_role_override").select("id").eq("board_id", boardId).eq("role_id", role_id).single();

		if (existing) {
			return NextResponse.json({ error: "Role override already exists for this board. Use PATCH to update." }, { status: 409 });
		}

		// Ensure board_config exists first
		const { data: boardConfig } = await supabaseAdmin.from("board_config").select("board_id").eq("board_id", boardId).single();

		if (!boardConfig) {
			return NextResponse.json({ error: "Board configuration must be created first" }, { status: 400 });
		}

		const overrideData: BoardRoleOverrideInsert = {
			board_id: boardId,
			role_id,
			hourly_rate,
			is_enabled: is_enabled !== false,
		};

		const { data: override, error } = await supabaseAdmin.from("board_role_override").insert(overrideData).select().single();

		if (error) {
			console.error("Error creating role override:", error);
			return NextResponse.json({ error: "Failed to create role override" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			override,
		});
	} catch (error) {
		console.error("Error in POST /api/admin/boards/[boardId]/role-overrides:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * PATCH /api/admin/boards/[boardId]/role-overrides
 * Update an existing role override
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const { boardId } = await params;
		const body = await request.json();
		const { role_id, hourly_rate, is_enabled } = body;

		// Validate required fields
		if (!role_id) {
			return NextResponse.json({ error: "Role ID is required" }, { status: 400 });
		}

		const updateData: BoardRoleOverrideUpdate = {
			updated_at: new Date().toISOString(),
		};

		if (typeof hourly_rate === "number") updateData.hourly_rate = hourly_rate;
		if (is_enabled !== undefined) updateData.is_enabled = is_enabled;

		const { data: override, error } = await supabaseAdmin.from("board_role_override").update(updateData).eq("board_id", boardId).eq("role_id", role_id).select().single();

		if (error) {
			console.error("Error updating role override:", error);
			return NextResponse.json({ error: "Failed to update role override" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			override,
		});
	} catch (error) {
		console.error("Error in PATCH /api/admin/boards/[boardId]/role-overrides:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * DELETE /api/admin/boards/[boardId]/role-overrides
 * Delete a role override
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const { boardId } = await params;
		const { searchParams } = new URL(request.url);
		const roleId = searchParams.get("roleId");

		if (!roleId) {
			return NextResponse.json({ error: "Role ID is required" }, { status: 400 });
		}

		const { error } = await supabaseAdmin.from("board_role_override").delete().eq("board_id", boardId).eq("role_id", roleId);

		if (error) {
			console.error("Error deleting role override:", error);
			return NextResponse.json({ error: "Failed to delete role override" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			message: "Role override deleted",
		});
	} catch (error) {
		console.error("Error in DELETE /api/admin/boards/[boardId]/role-overrides:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
