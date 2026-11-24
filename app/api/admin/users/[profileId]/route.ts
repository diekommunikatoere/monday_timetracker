import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * PATCH /api/admin/users/[profileId]
 *
 * Updates `is_active` on a `user_profiles` row in the caller's monday account.
 * Admin only.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ profileId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { profileId } = await params;
		if (!profileId) {
			return NextResponse.json({ error: "User profile ID is required" }, { status: 400 });
		}

		const body = await request.json();
		if (typeof body?.is_active !== "boolean") {
			return NextResponse.json({ error: "is_active boolean is required" }, { status: 400 });
		}

		const { data: existing, error: findError } = await supabaseAdmin.from("user_profiles").select("id, monday_account_id").eq("id", profileId).maybeSingle();

		if (findError) {
			console.error("Error looking up user profile:", findError);
			return NextResponse.json({ error: "Failed to look up user" }, { status: 500 });
		}

		if (!existing || existing.monday_account_id !== auth.accountId) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		const { data: user, error: updateError } = await supabaseAdmin
			.from("user_profiles")
			.update({
				is_active: body.is_active,
				updated_at: new Date().toISOString(),
			})
			.eq("id", profileId)
			.select("id, monday_user_id, name, email, photo_urls, is_admin, is_active, updated_at")
			.single();

		if (updateError) {
			console.error("Error updating user active status:", updateError);
			return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			user,
		});
	} catch (error) {
		console.error("Error in PATCH /api/admin/users/[profileId]:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
