import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * GET /api/admin/users
 *
 * Returns all `user_profiles` rows (active and inactive) for the admin's
 * monday account, sorted by name. Powers the admin "Benutzer" tab and lets
 * `PermissionsTab` resolve labels for inactive users who still hold grants.
 */
export async function GET(request: NextRequest) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { data: users, error } = await supabaseAdmin.from("user_profiles").select("id, monday_user_id, name, email, photo_urls, is_admin, is_active, updated_at").eq("monday_account_id", auth.accountId).order("name", { ascending: true });

		if (error) {
			console.error("Error fetching admin users:", error);
			return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
		}

		return NextResponse.json({
			success: true,
			users: users ?? [],
		});
	} catch (error) {
		console.error("Error in GET /api/admin/users:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
