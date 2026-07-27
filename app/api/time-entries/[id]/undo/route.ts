import { NextRequest, NextResponse } from "next/server";

import { queueItemSync } from "@/lib/columnSync";
import { restoreTimeEntry } from "@/lib/database";
import { getUserProfileByMondayId } from "@/lib/database/users";
import { verifyMondayJwt } from "@/lib/monday-auth";

/**
 * POST /api/time-entries/[id]/undo
 * Restore a soft-deleted time entry
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Validate session
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Invalid session" }, { status: 401 });
		}

		// Get user profile
		const userProfile = await getUserProfileByMondayId(session.userId);
		if (!userProfile) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		const userId = userProfile.id;

		const { id } = await params;
		const body = await request.json();
		const { undoToken } = body;

		if (!undoToken) {
			return NextResponse.json({ error: "Missing undo token" }, { status: 400 });
		}

		// Restore the entry
		const restoredEntry = await restoreTimeEntry(id, userId, undoToken);

		// Queue sync operation (non-blocking)
		if (restoredEntry.item_id && restoredEntry.board_id) {
			queueItemSync(restoredEntry.item_id, restoredEntry.board_id, userId, restoredEntry.id).catch((err) => {
				console.error("[API] Error queueing sync after undo:", err);
			});
		}

		return NextResponse.json({
			success: true,
			restored: restoredEntry,
		});
	} catch (error: any) {
		console.error("[API] Error restoring time entry:", error);
		return NextResponse.json({ error: error.message || "Failed to restore time entry" }, { status: 400 });
	}
}
