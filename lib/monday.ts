import { ApiClient, ClientError } from "@mondaydotcomorg/api";
import { NextRequest } from "next/server";
import { cacheHelper } from "./redis";

// Cache TTL constants (in seconds)
const CACHE_TTL = {
	BOARDS: 300, // 5 minutes - board names rarely change
	TASKS: 120, // 2 minutes - items may update more frequently
	USER_TEAMS: 600, // 10 minutes - team membership is stable
};

// Inline type definitions for API responses
type APIResponse<T> = {
	loading: boolean;
	error: APIError | null;
	data: T;
};

// Type definition for BoardsResponse
type BoardsResponse = {
	boards: Array<{
		id: string;
		name: string;
	}>;
	error?: APIError;
};

type TasksResponseWithGroups = {
	groups: Array<{
		id: string;
		title: string;
		items_page: {
			cursor: string | null;
			items: Array<{
				id: string;
				name: string;
				subitems: Array<{
					id: string;
					name: string;
				}>;
			}>;
		};
	}>;
};

// Type definition for TasksResponse
type TasksResponse = {
	boards: Array<{
		groups: TasksResponseWithGroups["groups"];
	}>;
	complexity?: {
		query: number;
	};
	error?: APIError;
};

type APIError = {
	message: string;
	status: number;
	errors?: Array<{
		message: string;
		path?: string[];
	}>;
};

// Board option type for caching
type BoardOption = { value: string; label: string };

// Task group type for caching
type TaskGroup = {
	label: string;
	options: Array<{
		id: string;
		value: string;
		label: string;
		name: string;
		parentItemId?: string;
		parentItemName?: string;
	}>;
};

// Ensure MONDAY_API_TOKEN is set
const token = process.env.MONDAY_API_TOKEN;
if (!token) {
	throw new Error("MONDAY_API_TOKEN is not set in environment variables");
}

// Create client instance once
const client = new ApiClient({ token, apiVersion: "2025-10" });

// Get connected boards by IDs - with Redis caching
export async function getConnectedBoards(boardIds: string[]): Promise<Array<BoardOption>> {
	if (!boardIds || !Array.isArray(boardIds) || boardIds.length === 0) {
		return [];
	}

	const startTime = Date.now();

	// Generate cache key based on sorted board IDs for consistency
	const cacheKey = `monday:boards:${boardIds.sort().join(",")}`;

	// Try cache first
	const cached = await cacheHelper.get<BoardOption[]>(cacheKey);
	if (cached) {
		console.log(`[getConnectedBoards] Cache HIT - ${Date.now() - startTime}ms`);
		return cached;
	}

	console.log("[getConnectedBoards] Cache MISS - fetching from API");

	const query = `
    query {
      boards(ids: [${boardIds}]) {
        id
        name
      }
    }
  `;

	try {
		const response: BoardsResponse = await client.request(query);

		if (response.error) {
			console.error("Monday API error in getConnectedBoards:", response.error?.message);
			throw new Error(response.error?.message || "Failed to fetch boards");
		}

		const boards = response.boards || [];
		const result = boards.map((board) => ({
			value: board.id.toString(),
			label: board.name,
		}));

		// Cache the result
		await cacheHelper.set(cacheKey, result, CACHE_TTL.BOARDS);

		console.log(`[getConnectedBoards] API fetch complete - ${Date.now() - startTime}ms`);
		return result;
	} catch (error) {
		if (error instanceof ClientError) {
			console.error("ClientError in getConnectedBoards:", error.response?.errors);
		}
		console.error("Error in getConnectedBoards:", error);
		throw new Error("Failed to fetch connected boards");
	}
}

// Get tasks (items and subitems) for a board with caching
export async function getBoardTasks(
	boardId: string,
	searchTerm?: string
): Promise<{
	groups: Array<TaskGroup>;
}> {
	// Validate boardId
	if (!boardId || isNaN(Number(boardId)) || Number(boardId) <= 0) {
		throw new Error("boardId must be a valid positive integer");
	}

	const startTime = Date.now();

	// Generate cache key - include searchTerm if present
	const cacheKey = searchTerm ? `monday:tasks:${boardId}:search:${searchTerm}` : `monday:tasks:${boardId}`;

	// Try cache first (skip cache for search queries to ensure fresh results)
	if (!searchTerm) {
		const cached = await cacheHelper.get<{ groups: TaskGroup[] }>(cacheKey);
		if (cached) {
			console.log(`[getBoardTasks] Cache HIT for board ${boardId} - ${Date.now() - startTime}ms`);
			return cached;
		}
	}

	console.log(`[getBoardTasks] Cache MISS for board ${boardId} - fetching from API`);

	const itemsByGroup: Map<string, any[]> = new Map();
	let cursor: string | null = null;
	let hasMore = true;
	let board: any = null;

	while (hasMore) {
		const query = `query ($boardId: ID!, $cursor: String) {boards (ids: [$boardId]) {groups {id title items_page( limit: 500, cursor: $cursor ) {cursor items { id name subitems {id name} } } } } complexity { query } }`;

		const variables: { boardId: string; cursor?: string | null } = { boardId };
		if (cursor) {
			variables.cursor = cursor;
		}

		try {
			const response: TasksResponse = await client.request(query, variables);

			if (response.error) {
				throw new Error(response.error?.message || "Failed to fetch tasks");
			}

			// Log complexity for monitoring
			if (response.complexity?.query && response.complexity.query > 5000) {
				console.warn(`[getBoardTasks] High complexity query: ${response.complexity.query}`);
			}

			board = response.boards[0];

			if (!board || !board.groups) {
				break;
			}

			// Collect items from all groups across the board
			for (const group of board.groups) {
				if (group.items_page?.items) {
					itemsByGroup.set(group.id, group.items_page.items);
				}
			}

			// For now, fetch only once; pagination can be added later if needed
			cursor = null;
			hasMore = false;
		} catch (error) {
			if (error instanceof ClientError) {
				console.error("ClientError in getBoardTasks:", error.response?.errors);
			}
			console.error("Error fetching tasks:", error);
			throw error;
		}
	}

	// Transform to grouped options (preserving original logic for subitems)
	if (!board || !board.groups) {
		return { groups: [] };
	}

	const groupedOptions: TaskGroup[] = board.groups
		.map((group: any) => {
			// Get items for this specific group
			const groupItems = itemsByGroup.get(group.id) || [];
			const options = groupItems.flatMap((item: any) => {
				if (item.subitems && item.subitems.length > 0) {
					return item.subitems.map((subitem: any) => ({
						id: subitem.id.toString(),
						value: subitem.id.toString(),
						label: `${item.name} > ${subitem.name}`,
						name: subitem.name,
						parentItemId: item.id.toString(),
						parentItemName: item.name,
					}));
				}
				return [
					{
						id: item.id.toString(),
						value: item.id.toString(),
						label: item.name,
						name: item.name,
					},
				];
			});

			return {
				label: group.title || "Default Group",
				options,
			};
		})
		.filter((group: TaskGroup) => group.options.length > 0);

	const result = { groups: groupedOptions };

	// Cache the result (only for non-search queries)
	if (!searchTerm) {
		await cacheHelper.set(cacheKey, result, CACHE_TTL.TASKS);
	}

	console.log(`[getBoardTasks] API fetch complete for board ${boardId} - ${Date.now() - startTime}ms`);
	return result;
}

// Batch fetch tasks for multiple boards (for prefetching)
export async function getBatchBoardTasks(boardIds: string[]): Promise<Map<string, { groups: TaskGroup[] }>> {
	const startTime = Date.now();
	const results = new Map<string, { groups: TaskGroup[] }>();

	// Check cache for each board first
	const uncachedBoardIds: string[] = [];
	for (const boardId of boardIds) {
		const cacheKey = `monday:tasks:${boardId}`;
		const cached = await cacheHelper.get<{ groups: TaskGroup[] }>(cacheKey);
		if (cached) {
			results.set(boardId, cached);
		} else {
			uncachedBoardIds.push(boardId);
		}
	}

	console.log(`[getBatchBoardTasks] Cache: ${boardIds.length - uncachedBoardIds.length} hits, ${uncachedBoardIds.length} misses`);

	if (uncachedBoardIds.length === 0) {
		console.log(`[getBatchBoardTasks] All cached - ${Date.now() - startTime}ms`);
		return results;
	}

	// Fetch uncached boards in parallel (with concurrency limit)
	const CONCURRENCY_LIMIT = 3; // Don't overwhelm the API
	const chunks: string[][] = [];
	for (let i = 0; i < uncachedBoardIds.length; i += CONCURRENCY_LIMIT) {
		chunks.push(uncachedBoardIds.slice(i, i + CONCURRENCY_LIMIT));
	}

	for (const chunk of chunks) {
		const fetchPromises = chunk.map(async (boardId) => {
			try {
				const tasks = await getBoardTasks(boardId);
				results.set(boardId, tasks);
			} catch (error) {
				console.error(`[getBatchBoardTasks] Failed to fetch board ${boardId}:`, error);
				results.set(boardId, { groups: [] });
			}
		});

		await Promise.all(fetchPromises);
	}

	console.log(`[getBatchBoardTasks] Complete - ${Date.now() - startTime}ms`);
	return results;
}

// Invalidate cache for a specific board (call after write operations)
export async function invalidateBoardCache(boardId: string): Promise<void> {
	await cacheHelper.del(`monday:tasks:${boardId}`);
	console.log(`[invalidateBoardCache] Cleared cache for board ${boardId}`);
}

// Invalidate all board caches (for forced refresh)
export async function invalidateAllBoardCaches(): Promise<void> {
	await cacheHelper.clearPattern("monday:tasks:*");
	await cacheHelper.clearPattern("monday:boards:*");
	console.log("[invalidateAllBoardCaches] Cleared all monday caches");
}

// Extract and validate monday.com context from API requests
export async function getMondayContext(request: NextRequest) {
	const contextHeader = request.headers.get("monday-context");
	if (!contextHeader) {
		throw new Error("No monday context provided");
	}

	try {
		const context = JSON.parse(contextHeader);
		// Validate essential fields based on authentication guidelines
		if (!context.data?.user?.id || !context.data?.account?.id) {
			throw new Error("Invalid monday context: missing user or account data");
		}
		return context.data;
	} catch (error) {
		throw new Error("Failed to parse monday context");
	}
}

// Get teams for a specific user - with Redis caching
export async function getUserTeams(userId: string): Promise<Array<{ id: string; name: string }>> {
	if (!userId) {
		return [];
	}

	const startTime = Date.now();
	const cacheKey = `monday:user_teams:${userId}`;

	// Try cache first
	const cached = await cacheHelper.get<Array<{ id: string; name: string }>>(cacheKey);
	if (cached) {
		console.log(`[getUserTeams] Cache HIT - ${Date.now() - startTime}ms`);
		return cached;
	}

	console.log("[getUserTeams] Cache MISS - fetching from API");

	const query = `
		query {
			users(ids: [${userId}]) {
				teams {
					id
					name
				}
			}
		}
	`;

	try {
		const response: any = await client.request(query);

		if (response.error) {
			console.error("Monday API error in getUserTeams:", response.error?.message);
			throw new Error(response.error?.message || "Failed to fetch user teams");
		}

		const users = response.users || [];
		let teams: Array<{ id: string; name: string }> = [];

		if (users.length > 0 && users[0].teams) {
			teams = users[0].teams;
		}

		// Cache the result
		await cacheHelper.set(cacheKey, teams, CACHE_TTL.USER_TEAMS);

		console.log(`[getUserTeams] API fetch complete - ${Date.now() - startTime}ms`);
		return teams;
	} catch (error) {
		console.error("Error in getUserTeams:", error);
		// Don't fail the whole auth process if teams fetch fails, just return empty
		return [];
	}
}
