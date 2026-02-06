import { NextRequest, NextResponse } from "next/server";
import { invalidateBoardCache, invalidateAllBoardCaches } from "@/lib/monday";
import { verifyMondayJwt } from "@/lib/monday-auth";

/**
 * POST /api/tasks/refresh
 */
export async function POST(request: NextRequest) {
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

		const { searchParams } = new URL(request.url);
		const boardId = searchParams.get("boardId");

		if (boardId) {
			// Validate boardId
			if (isNaN(Number(boardId)) || Number(boardId) <= 0) {
				return NextResponse.json({ error: "boardId must be a valid positive integer" }, { status: 400 });
			}

			await invalidateBoardCache(boardId);
			console.log(`[api/tasks/refresh] Invalidated cache for board ${boardId}`);

			return NextResponse.json({
				success: true,
				message: `Cache invalidated for board ${boardId}`,
			});
		} else {
			// Invalidate all board caches
			await invalidateAllBoardCaches();
			console.log("[api/tasks/refresh] Invalidated all board caches");

			return NextResponse.json({
				success: true,
				message: "All board caches invalidated",
			});
		}
	} catch (error) {
		console.error("Error invalidating cache:", error);
		return NextResponse.json({ error: "Failed to invalidate cache" }, { status: 500 });
	}
}
