import { NextRequest, NextResponse } from "next/server";
import { ClientError } from "@mondaydotcomorg/api";
import { getBatchBoardTasks } from "@/lib/monday";

/**
 * POST /api/tasks/batch
 *
 * Fetches tasks for multiple boards in a single request.
 * This is more efficient than making separate requests for each board.
 *
 * Request body: { boardIds: string[] }
 * Response: { [boardId: string]: TaskGroupsResponse }
 */
export async function POST(request: NextRequest) {
	try {
		const { boardIds } = await request.json();

		// Validate boardIds
		if (!boardIds || !Array.isArray(boardIds) || boardIds.length === 0) {
			return NextResponse.json({ error: "boardIds must be a non-empty array" }, { status: 400 });
		}

		// Validate each boardId
		for (const boardId of boardIds) {
			if (!boardId || isNaN(Number(boardId)) || Number(boardId) <= 0) {
				return NextResponse.json({ error: `Invalid boardId: ${boardId}. Must be a valid positive integer` }, { status: 400 });
			}
		}

		// Limit the number of boards that can be fetched at once
		const MAX_BOARDS = 10;
		if (boardIds.length > MAX_BOARDS) {
			return NextResponse.json({ error: `Cannot fetch more than ${MAX_BOARDS} boards at once` }, { status: 400 });
		}

		const startTime = Date.now();
		const tasksMap = await getBatchBoardTasks(boardIds);

		// Convert Map to object for JSON response
		const tasksObject: Record<string, { groups: any[] }> = {};
		for (const [boardId, tasks] of tasksMap) {
			tasksObject[boardId] = tasks;
		}

		console.log(`[api/tasks/batch] Fetched ${boardIds.length} boards in ${Date.now() - startTime}ms`);

		return NextResponse.json(tasksObject);
	} catch (error) {
		if (error instanceof ClientError) {
			console.error("Monday API ClientError:", error.response?.errors);
			return NextResponse.json({ error: error.response?.errors?.[0]?.message || "Failed to fetch tasks" }, { status: 500 });
		}
		console.error("Error fetching batch tasks:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
