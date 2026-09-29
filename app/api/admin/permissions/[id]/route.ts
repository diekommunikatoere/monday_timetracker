import { NextRequest, NextResponse } from "next/server";

import { removeGrant } from "@/lib/database/permissions";
import { requireAdmin } from "@/lib/monday-auth";

/**
 * DELETE /api/admin/permissions/[id]
 * Revoke a permission grant. Admin only. Idempotent.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { id } = await params;
		await removeGrant(id);
		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error in DELETE /api/admin/permissions/[id]:", error);
		return NextResponse.json({ error: "Failed to remove permission grant" }, { status: 500 });
	}
}
