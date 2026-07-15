import { NextRequest, NextResponse } from "next/server";
import { ClientError } from "@mondaydotcomorg/api";
import { getBoardTasks } from "@/lib/monday";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getTasksFromDB } from "@/lib/database";

// Disable Next.js caching to ensure fresh data on each request
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
		const searchTerm = searchParams.get("searchTerm");

		// Validate boardId as a valid positive integer string
		if (!boardId || isNaN(Number(boardId)) || Number(boardId) <= 0) {
			return NextResponse.json({ error: "boardId must be a valid positive integer" }, { status: 400 });
		}

		let tasksData;

		try {
			// Try to get tasks from DB first (fast path)
			console.log(`[API /api/tasks] Attempting to fetch tasks for board ${boardId} from DB`);
			const tasks = await getTasksFromDB(boardId);
			console.log(`[API /api/tasks] DB returned ${tasks.length} tasks for board ${boardId}`);

			if (tasks.length > 0) {
				// Apply simple search filtering if provided
				const filteredTasks = searchTerm ? tasks.filter((t: any) => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.group.title.toLowerCase().includes(searchTerm.toLowerCase()) || t.parent_item?.name.toLowerCase().includes(searchTerm.toLowerCase())) : tasks;
				console.log(`[API /api/tasks] After search filtering ("${searchTerm || ""}"), ${filteredTasks.length} tasks remaining`);

				// Transform into grouped format for frontend
				const groupsMap = new Map<string, any>();

				filteredTasks.forEach((task: any) => {
					const groupId = task.group.id;
					if (!groupsMap.has(groupId)) {
						groupsMap.set(groupId, {
							label: task.group.title,
							position: task.group.position,
							color: task.group.color,
							options: [],
						});
					}

					groupsMap.get(groupId).options.push({
						value: task.id,
						label: task.parent_item ? `${task.parent_item.name} > ${task.name}` : task.name,
						name: task.name,
						parentItemId: task.parent_item?.id,
						parentItemName: task.parent_item?.name,
					});
				});

				tasksData = {
					groups: Array.from(groupsMap.values())
						.sort((a, b) => {
							// Sort groups by board position (if available)
							if (a.position !== null && b.position !== null) {
								return a.position.localeCompare(b.position, undefined, { numeric: true });
							}
							return a.label.localeCompare(b.label);
						})
						.map((group) => ({
							label: group.label,
							color: group.color,
							options: group.options.sort((a: any, b: any) => a.label.localeCompare(b.label)), // Sort items within group alphabetically
						})),
					source: "db",
				};
			} else {
				// Fallback to Monday API if no tasks in DB
				tasksData = await getBoardTasks(boardId, searchTerm);
				tasksData.source = "api";
			}
		} catch (dbError) {
			console.error("Failed to fetch tasks from DB, falling back to Monday API:", dbError);
			tasksData = await getBoardTasks(boardId, searchTerm);
			tasksData.source = "api";
		}

		return NextResponse.json(tasksData);
	} catch (error) {
		if (error instanceof ClientError) {
			console.error("Monday API ClientError:", error.response?.errors);
			return NextResponse.json({ error: error.response?.errors?.[0]?.message || "Failed to fetch tasks" }, { status: 500 });
		}
		console.error("Error fetching tasks:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
