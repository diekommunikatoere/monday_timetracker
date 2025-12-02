import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { RoleInsert, RoleUpdate } from "@/types/database";

/**
 * GET /api/admin/roles
 * Fetch all roles (optionally filter by active status)
 * Note: Admin access is validated client-side via monday SDK
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const activeOnly = searchParams.get("active") === "true";

		let query = supabaseAdmin.from("role").select("*").order("name", { ascending: true });

		if (activeOnly) {
			query = query.eq("is_active", true);
		}

		const { data: roles, error } = await query;

		if (error) {
			console.error("Error fetching roles:", error);
			return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			roles: roles || [],
			count: roles?.length || 0,
		});
	} catch (error) {
		console.error("Error in GET /api/admin/roles:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * POST /api/admin/roles
 * Create a new role
 */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { name, description, hourly_rate, color_hex, is_active } = body;

		// Validate required fields
		if (!name || typeof name !== "string" || name.trim().length === 0) {
			return NextResponse.json({ error: "Role name is required" }, { status: 400 });
		}

		// Check for duplicate name
		const { data: existing } = await supabaseAdmin.from("role").select("id").eq("name", name.trim()).single();

		if (existing) {
			return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
		}

		const roleData: RoleInsert = {
			name: name.trim(),
			description: description?.trim() || null,
			hourly_rate: typeof hourly_rate === "number" ? hourly_rate : 0,
			color_hex: color_hex || null,
			is_active: is_active !== false, // Default to true
		};

		const { data: role, error } = await supabaseAdmin.from("role").insert(roleData).select().single();

		if (error) {
			console.error("Error creating role:", error);
			return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			role,
		});
	} catch (error) {
		console.error("Error in POST /api/admin/roles:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * PATCH /api/admin/roles
 * Update an existing role
 */
export async function PATCH(request: NextRequest) {
	try {
		const body = await request.json();
		const { id, name, description, hourly_rate, color_hex, is_active } = body;

		// Validate required fields
		if (!id) {
			return NextResponse.json({ error: "Role ID is required" }, { status: 400 });
		}

		// Check for duplicate name if name is being updated
		if (name) {
			const { data: existing } = await supabaseAdmin.from("role").select("id").eq("name", name.trim()).neq("id", id).single();

			if (existing) {
				return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
			}
		}

		const updateData: RoleUpdate = {
			updated_at: new Date().toISOString(),
		};

		if (name !== undefined) updateData.name = name.trim();
		if (description !== undefined) updateData.description = description?.trim() || null;
		if (hourly_rate !== undefined) updateData.hourly_rate = hourly_rate;
		if (color_hex !== undefined) updateData.color_hex = color_hex || null;
		if (is_active !== undefined) updateData.is_active = is_active;

		const { data: role, error } = await supabaseAdmin.from("role").update(updateData).eq("id", id).select().single();

		if (error) {
			console.error("Error updating role:", error);
			return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			role,
		});
	} catch (error) {
		console.error("Error in PATCH /api/admin/roles:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

/**
 * DELETE /api/admin/roles
 * Delete a role (soft delete by setting is_active to false, or hard delete)
 */
export async function DELETE(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const id = searchParams.get("id");
		const hardDelete = searchParams.get("hard") === "true";

		if (!id) {
			return NextResponse.json({ error: "Role ID is required" }, { status: 400 });
		}

		// Check if role is in use
		const { count } = await supabaseAdmin.from("time_entry").select("*", { count: "exact", head: true }).eq("role", id);

		if (count && count > 0 && hardDelete) {
			return NextResponse.json(
				{
					error: "Cannot delete role that is in use. Deactivate it instead.",
					timeEntriesCount: count,
				},
				{ status: 409 }
			);
		}

		if (hardDelete) {
			const { error } = await supabaseAdmin.from("role").delete().eq("id", id);

			if (error) {
				console.error("Error deleting role:", error);
				return NextResponse.json({ error: "Failed to delete role" }, { status: 500 });
			}
		} else {
			// Soft delete - just deactivate
			const { error } = await supabaseAdmin.from("role").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);

			if (error) {
				console.error("Error deactivating role:", error);
				return NextResponse.json({ error: "Failed to deactivate role" }, { status: 500 });
			}
		}

		return NextResponse.json({
			success: true,
			message: hardDelete ? "Role deleted" : "Role deactivated",
		});
	} catch (error) {
		console.error("Error in DELETE /api/admin/roles:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
