import { NextRequest, NextResponse } from "next/server";
import { invalidateBoardCache, invalidateAllBoardCaches } from "@/lib/monday";

/**
 * POST /api/tasks/refresh
 *
 * Invalidates the Redis cache for a specific board's tasks,
 * forcing the next request to fetch fresh data from monday.com.
 *
 * Query params:
 * - boardId (optional): Specific board to refresh. If not provided, refreshes all boards.
 *
 * Response: { success: true, message: string }
 */
export async function POST(request: NextRequest) {
	try {
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
