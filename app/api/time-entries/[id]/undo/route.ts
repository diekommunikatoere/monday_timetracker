// app/api/time-entries/[id]/undo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { restoreTimeEntry } from "@/lib/database";
import { queueItemSync } from "@/lib/columnSync";

/**
 * POST /api/time-entries/[id]/undo
 * Restore a soft-deleted time entry
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
	try {
		// Get user ID for user authentication
		const userId = request.headers.get("userId");

		if (!userId) {
			return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
		}

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
