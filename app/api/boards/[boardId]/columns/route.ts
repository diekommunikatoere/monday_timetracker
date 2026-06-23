/**
 * API Route: GET /api/boards/[boardId]/columns
 *
 * Fetches all columns for a specific monday.com board.
 * Returns columns with compatibility information for time tracking sync.
 * Note: Authentication is handled server-side via requireAdmin
 */

import { NextRequest, NextResponse } from "next/server";
import { getBoardColumns, getColumnsForPurpose, MondayColumnOption } from "@/lib/monday/columnSync";
import { SyncPurpose } from "@/types/database";
import { requireAdmin } from "@/lib/monday-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ boardId: string }> }) {
	try {
		const auth = requireAdmin(request);
		if (auth instanceof NextResponse) return auth;

		const { boardId } = await params;

		// Validate boardId
		if (!boardId || isNaN(Number(boardId))) {
			return NextResponse.json({ error: "Invalid board ID" }, { status: 400 });
		}

		// Check if filtering by purpose
		const { searchParams } = new URL(request.url);
		const purpose = searchParams.get("purpose") as SyncPurpose | null;
		const compatibleOnly = searchParams.get("compatible") === "true";

		let columns: MondayColumnOption[];

		if (purpose) {
			// Get columns compatible with specific purpose
			columns = await getColumnsForPurpose(boardId, purpose);
		} else {
			// Get all columns
			columns = await getBoardColumns(boardId);

			// Optionally filter to compatible only
			if (compatibleOnly) {
				columns = columns.filter((col) => col.isCompatible);
			}
		}

		return NextResponse.json({
			success: true,
			boardId,
			columns,
			count: columns.length,
		});
	} catch (error) {
		console.error("[GET /api/boards/[boardId]/columns] Error:", error);

		const errorMessage = error instanceof Error ? error.message : "Failed to fetch columns";
		const status = errorMessage.includes("Unauthorized") ? 401 : 500;

		return NextResponse.json({ error: errorMessage }, { status });
	}
}
