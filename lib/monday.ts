import { ApiClient, ClientError } from "@mondaydotcomorg/api";
import { NextRequest } from "next/server";
import { cacheHelper } from "./redis";
import { upsertMondayBoard, upsertMondayItem, upsertMondayItemsBatch } from "./database";

// Cache TTL constants (in seconds)
const CACHE_TTL = {
	BOARDS: 60 * 60, // 1 hour - board names rarely change
	TASKS: 60 * 30, // 30 minutes - items may update more frequently
	USER_TEAMS: 60 * 60 * 24, // 24 hours - team membership is stable
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

// Type for items without subitems (low complexity query)
type SimpleItem = {
	id: string;
	name: string;
};

// Type for items with subitems (separate query)
type ItemWithSubitems = {
	id: string;
	subitems: Array<{
		id: string;
		name: string;
	}>;
};

// Type for paginated items response
type ItemsPageResponse = {
	boards: Array<{
		groups: Array<{
			id: string;
			title: string;
			position: string;
			items_page: {
				cursor: string | null;
				items: SimpleItem[];
			};
		}>;
	}>;
	complexity?: {
		query: number;
	};
	error?: APIError;
};

// Type for subitems query response
type SubitemsResponse = {
	items: ItemWithSubitems[];
	complexity?: {
		query: number;
	};
	error?: APIError;
};

// Type definition for TasksResponse (legacy, kept for compatibility)
type TasksResponse = {
	boards: Array<{
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

// Internal type for tracking items during pagination
type GroupItems = {
	groupId: string;
	groupTitle: string;
	groupPosition: string;
	items: SimpleItem[];
};

export interface LinkedItem {
	id: string;
	boardId: string;
}

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

		// UPSERT boards into dimension table (fire-and-forget)
		Promise.all(boards.map((board) => upsertMondayBoard(board.id.toString(), board.name))).catch((err) => console.error("[getConnectedBoards] Background upsert error:", err));

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
// OPTIMIZED: Uses separate queries for items and subitems to reduce complexity
export async function getBoardTasks(
	boardId: string,
	searchTerm?: string,
): Promise<{
	groups: Array<TaskGroup>;
}> {
	// Validate boardId
	if (!boardId || isNaN(Number(boardId)) || Number(boardId) <= 0) {
		throw new Error("boardId must be a valid positive integer");
	}

	const startTime = Date.now();

	console.log(`[getBoardTasks] Fetching tasks for board ${boardId} from API`);

	// Phase 1: Fetch all items with pagination (low complexity - no subitems)
	const allGroupItems: GroupItems[] = [];
	let totalComplexity = 0;

	// Map to track cursors per group for pagination
	const groupCursors = new Map<string, string | null>();

	// Query for initial items (no subitems to reduce complexity)
	const initialItemsQuery = `
		query ($boardId: ID!) {
			boards(ids: [$boardId]) {
				groups {
					id
					title
					position
					items_page(limit: 200) {
						cursor
						items {
							id
							name
						}
					}
				}
			}
			complexity {
				query
			}
		}
	`;

	// Query for subsequent pages using next_items_page
	const nextItemsPageQuery = `
		query ($cursor: String!) {
			next_items_page(limit: 200, cursor: $cursor) {
				cursor
				items {
					id
					name
				}
			}
			complexity {
				query
			}
		}
	`;

	try {
		// Initial fetch - get first page of all groups
		const response: ItemsPageResponse = await client.request(initialItemsQuery, { boardId });

		if (response.error) {
			throw new Error(response.error?.message || "Failed to fetch tasks");
		}

		// Track complexity
		if (response.complexity?.query) {
			totalComplexity += response.complexity.query;
			if (response.complexity.query > 2000) {
				console.warn(`[getBoardTasks] High complexity query: ${response.complexity.query}`);
			}
		}

		const board = response.boards?.[0];
		if (!board || !board.groups) {
			console.log(`[getBoardTasks] No board or groups found in response`);
			return { groups: [] };
		}

		console.log(`[getBoardTasks] Received ${board.groups.length} groups in initial fetch`);

		// Collect items from all groups and track cursors
		for (const group of board.groups) {
			const itemCount = group.items_page?.items?.length || 0;
			const cursor = group.items_page?.cursor || null;
			console.log(`[getBoardTasks] Group "${group.title}" (${group.id}): ${itemCount} items, has cursor: ${!!cursor}`);

			allGroupItems.push({
				groupId: group.id,
				groupTitle: group.title,
				groupPosition: group.position,
				items: [...group.items_page.items],
			});

			// Store cursor for pagination if present
			if (cursor) {
				groupCursors.set(group.id, cursor);
			}
		}

		// Paginate each group that has more items
		while (groupCursors.size > 0) {
			const pendingGroups = Array.from(groupCursors.entries());
			console.log(`[getBoardTasks] Fetching next pages for ${pendingGroups.length} groups with more items`);

			// Process each group with a cursor
			for (const [groupId, cursor] of pendingGroups) {
				if (!cursor) continue;

				try {
					const pageResponse: {
						next_items_page?: {
							cursor: string | null;
							items: SimpleItem[];
						};
						complexity?: { query: number };
						error?: APIError;
					} = await client.request(nextItemsPageQuery, { cursor });

					if (pageResponse.error) {
						console.warn(`[getBoardTasks] Pagination error for group ${groupId}: ${pageResponse.error.message}`);
						groupCursors.delete(groupId);
						continue;
					}

					// Track complexity
					if (pageResponse.complexity?.query) {
						totalComplexity += pageResponse.complexity.query;
					}

					const nextPage = pageResponse.next_items_page;
					if (!nextPage) {
						groupCursors.delete(groupId);
						continue;
					}

					// Find the group and append items
					const group = allGroupItems.find((g) => g.groupId === groupId);
					if (group && nextPage.items.length > 0) {
						group.items.push(...nextPage.items);
						console.log(`[getBoardTasks] Group ${groupId}: fetched ${nextPage.items.length} more items, total: ${group.items.length}`);
					}

					// Update or remove cursor
					if (nextPage.cursor) {
						groupCursors.set(groupId, nextPage.cursor);
					} else {
						groupCursors.delete(groupId);
						console.log(`[getBoardTasks] Group ${groupId}: no more pages`);
					}
				} catch (error) {
					console.error(`[getBoardTasks] Error fetching next page for group ${groupId}:`, error);
					groupCursors.delete(groupId);
				}
			}
		}
	} catch (error) {
		if (error instanceof ClientError) {
			console.error("ClientError in getBoardTasks (items phase):", error.response?.errors);
		}
		console.error("Error fetching tasks (items phase):", error);
		throw error;
	}

	// Phase 2: Fetch subitems by discovering the subitems board and querying it directly
	// This avoids the items(ids:) batch limit issues and uses reliable items_page pagination
	const subitemsByParentId = new Map<string, Array<{ id: string; name: string }>>();
	let parentsWithSubitems = 0;
	let totalSubitemsFound = 0;

	// Step 1: Discover the subitems board ID by fetching one item with subitems
	let subitemsBoardId: string | null = null;
	try {
		const discoveryQuery = `
			query ($boardId: ID!) {
				boards(ids: [$boardId]) {
					items_page(limit: 1) {
						items {
							subitems {
								board {
									id
								}
							}
						}
					}
				}
			}
		`;
		const discoveryResponse: {
			boards?: Array<{
				items_page?: {
					items?: Array<{
						subitems?: Array<{
							board?: { id: string };
						}>;
					}>;
				};
			}>;
			error?: APIError;
		} = await client.request(discoveryQuery, { boardId });

		if (!discoveryResponse.error) {
			const firstItemWithSubitems = discoveryResponse.boards?.[0]?.items_page?.items?.find((item) => item.subitems && item.subitems.length > 0);
			if (firstItemWithSubitems?.subitems?.[0]?.board?.id) {
				subitemsBoardId = firstItemWithSubitems.subitems[0].board.id;
				console.log(`[getBoardTasks] Phase 2: Discovered subitems board ID: ${subitemsBoardId}`);
			}
		}
	} catch (error) {
		console.warn("[getBoardTasks] Phase 2: Failed to discover subitems board ID:", error);
	}

	// Step 2: If we found a subitems board, query it with items_page pagination
	if (subitemsBoardId) {
		console.log(`[getBoardTasks] Phase 2: Fetching subitems from board ${subitemsBoardId}`);

		const subitemsBoardQuery = `
			query ($subitemsBoardId: ID!) {
				boards(ids: [$subitemsBoardId]) {
					items_page(limit: 200) {
						cursor
						items {
							id
							name
							parent_item {
								id
							}
						}
					}
				}
				complexity {
					query
				}
			}
		`;

		const nextSubitemsPageQuery = `
			query ($cursor: String!) {
				next_items_page(limit: 200, cursor: $cursor) {
					cursor
					items {
						id
						name
						parent_item {
							id
						}
					}
				}
				complexity {
					query
				}
			}
		`;

		try {
			// Initial fetch
			const initialResponse: {
				boards?: Array<{
					items_page?: {
						cursor: string | null;
						items: Array<{
							id: string;
							name: string;
							parent_item?: { id: string } | null;
						}>;
					};
				}>;
				complexity?: { query: number };
				error?: APIError;
			} = await client.request(subitemsBoardQuery, { subitemsBoardId });

			if (initialResponse.error) {
				console.error(`[getBoardTasks] Phase 2: Subitems board query error: ${initialResponse.error.message}`);
			} else {
				// Track complexity
				if (initialResponse.complexity?.query) {
					totalComplexity += initialResponse.complexity.query;
				}

				const subitemsBoard = initialResponse.boards?.[0];
				if (subitemsBoard?.items_page) {
					let cursor = subitemsBoard.items_page.cursor;
					let allSubitems = [...subitemsBoard.items_page.items];

					console.log(`[getBoardTasks] Phase 2: Fetched ${allSubitems.length} subitems initially`);

					// Paginate if needed
					while (cursor) {
						try {
							const pageResponse: {
								next_items_page?: {
									cursor: string | null;
									items: Array<{
										id: string;
										name: string;
										parent_item?: { id: string } | null;
									}>;
								};
								complexity?: { query: number };
								error?: APIError;
							} = await client.request(nextSubitemsPageQuery, { cursor });

							if (pageResponse.error) {
								console.warn(`[getBoardTasks] Phase 2: Pagination error: ${pageResponse.error.message}`);
								break;
							}

							if (pageResponse.complexity?.query) {
								totalComplexity += pageResponse.complexity.query;
							}

							const nextPage = pageResponse.next_items_page;
							if (!nextPage) break;

							allSubitems.push(...nextPage.items);
							cursor = nextPage.cursor;

							console.log(`[getBoardTasks] Phase 2: Fetched ${nextPage.items.length} more subitems, total: ${allSubitems.length}`);
						} catch (error) {
							console.error("[getBoardTasks] Phase 2: Error fetching next subitems page:", error);
							break;
						}
					}

					// Group subitems by parent
					for (const subitem of allSubitems) {
						const parentId = subitem.parent_item?.id;
						if (parentId) {
							if (!subitemsByParentId.has(parentId)) {
								subitemsByParentId.set(parentId, []);
								parentsWithSubitems++;
							}
							subitemsByParentId.get(parentId)!.push({
								id: subitem.id,
								name: subitem.name,
							});
							totalSubitemsFound++;
						}
					}
				}
			}
		} catch (error) {
			console.error("[getBoardTasks] Phase 2: Error querying subitems board:", error);
		}
	} else {
		console.log("[getBoardTasks] Phase 2: No subitems board found, skipping subitem fetch");
	}

	console.log(`[getBoardTasks] Phase 2 complete: ${parentsWithSubitems} parents have subitems (${totalSubitemsFound} total subitems)`);

	// Fire-and-forget: batch upsert items to database (don't block response)
	// Collect all items into a single array for batch processing
	const itemsToUpsert: { id: string; name: string; boardId: string; parentItemId?: string | null; groupId?: string | null }[] = [];

	for (const group of allGroupItems) {
		for (const item of group.items) {
			// Add main item
			itemsToUpsert.push({
				id: item.id.toString(),
				name: item.name,
				boardId,
				parentItemId: null,
				groupId: group.groupId,
			});

			// Add subitems if they exist
			const subitems = subitemsByParentId.get(item.id);
			if (subitems) {
				for (const subitem of subitems) {
					itemsToUpsert.push({
						id: subitem.id.toString(),
						name: subitem.name,
						boardId,
						parentItemId: item.id.toString(),
						groupId: group.groupId,
					});
				}
			}
		}
	}

	console.log(`[getBoardTasks] Triggering background batch upsert for ${itemsToUpsert.length} total items`);
	// Use batch upsert instead of individual requests to prevent connection pool exhaustion
	upsertMondayItemsBatch(itemsToUpsert).catch((err) => console.error("[getBoardTasks] Background batch upsert error:", err));

	// Transform to grouped options and sort
	const groupedOptions: TaskGroup[] = allGroupItems
		.map((group) => {
			const options = group.items.flatMap((item) => {
				const subitems = subitemsByParentId.get(item.id);
				if (subitems && subitems.length > 0) {
					return subitems.map((subitem) => ({
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

			// Sort items within group alphabetically by label
			const sortedOptions = options.sort((a, b) => a.label.localeCompare(b.label));

			return {
				label: group.groupTitle || "Default Group",
				position: group.groupPosition,
				options: sortedOptions,
			};
		})
		.filter((group: TaskGroup & { position: string }) => group.options.length > 0)
		.sort((a, b) => {
			// Sort groups by board position (numeric string comparison)
			return a.position.localeCompare(b.position, undefined, { numeric: true });
		})
		.map(({ label, options }) => ({ label, options })); // Remove position from final output to match TaskGroup type

	const result = { groups: groupedOptions };

	console.log(`[getBoardTasks] API fetch complete for board ${boardId} - ${Date.now() - startTime}ms, total complexity: ${totalComplexity}`);
	return result;
}

// Batch fetch tasks for multiple boards (for prefetching)
// OPTIMIZED: Sequential fetching to avoid overwhelming the API
export async function getBatchBoardTasks(boardIds: string[]): Promise<Map<string, { groups: TaskGroup[] }>> {
	const startTime = Date.now();
	const results = new Map<string, { groups: TaskGroup[] }>();

	console.log(`[getBatchBoardTasks] Fetching ${boardIds.length} boards from API`);

	// OPTIMIZATION: Sequential fetching instead of parallel to avoid API overload
	for (const boardId of boardIds) {
		try {
			const tasks = await getBoardTasks(boardId);
			results.set(boardId, tasks);
			console.log(`[getBatchBoardTasks] Fetched board ${boardId} sequentially`);
		} catch (error) {
			console.error(`[getBatchBoardTasks] Failed to fetch board ${boardId}:`, error);
			results.set(boardId, { groups: [] });
		}
	}

	console.log(`[getBatchBoardTasks] Complete - ${Date.now() - startTime}ms`);
	return results;
}

// Invalidate all board caches (for forced refresh)
export async function invalidateAllBoardCaches(): Promise<void> {
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

// Get details for a specific user including teams and photos - with Redis caching
export async function getUserDetails(userId: string): Promise<{
	teams: Array<{ id: string; name: string }>;
	photo_urls: {
		original: string | null;
		small: string | null;
		thumb: string | null;
		thumb_small: string | null;
		tiny: string | null;
	};
}> {
	if (!userId) {
		return {
			teams: [],
			photo_urls: { original: null, small: null, thumb: null, thumb_small: null, tiny: null },
		};
	}

	const startTime = Date.now();
	const cacheKey = `monday:user_details:${userId}`;

	// Try cache first
	const cached = await cacheHelper.get<{
		teams: Array<{ id: string; name: string }>;
		photo_urls: any;
	}>(cacheKey);
	if (cached) {
		console.log(`[getUserDetails] Cache HIT - ${Date.now() - startTime}ms`);
		return cached;
	}

	console.log("[getUserDetails] Cache MISS - fetching from API");

	const query = `
		query {
			users(ids: [${userId}]) {
				teams {
					id
					name
				}
				photo_original
				photo_small
				photo_thumb
				photo_thumb_small
				photo_tiny
			}
		}
	`;

	try {
		const response: any = await client.request(query);

		if (response.error) {
			console.error("Monday API error in getUserDetails:", response.error?.message);
			throw new Error(response.error?.message || "Failed to fetch user details");
		}

		const users = response.users || [];
		let teams: Array<{ id: string; name: string }> = [];
		let photo_urls = {
			original: null,
			small: null,
			thumb: null,
			thumb_small: null,
			tiny: null,
		};

		if (users.length > 0) {
			if (users[0].teams) {
				teams = users[0].teams;
			}
			photo_urls = {
				original: users[0].photo_original,
				small: users[0].photo_small,
				thumb: users[0].photo_thumb,
				thumb_small: users[0].photo_thumb_small,
				tiny: users[0].photo_tiny,
			};
		}

		const result = { teams, photo_urls };

		// Cache the result
		await cacheHelper.set(cacheKey, result, CACHE_TTL.USER_TEAMS);

		console.log(`[getUserDetails] API fetch complete - ${Date.now() - startTime}ms`);
		return result;
	} catch (error) {
		console.error("Error in getUserDetails:", error);
		return {
			teams: [],
			photo_urls: { original: null, small: null, thumb: null, thumb_small: null, tiny: null },
		};
	}
}

// Get teams for a specific user - with Redis caching
export async function getUserTeams(userId: string): Promise<Array<{ id: string; name: string }>> {
	const details = await getUserDetails(userId);
	return details.teams;
}

/**
 * Find items on a target board that are linked to a specific item on a source board
 * via connect_boards (board_relation) columns.
 */
export async function findLinkedItems(boardId: string, itemId: string, targetBoardId: string): Promise<string[]> {
	if (!boardId || !itemId || !targetBoardId) {
		return [];
	}

	const query = `
		query GetLinkedItems($boardId: [ID!], $itemId: [ID!]) {
			boards(ids: $boardId) {
				columns {
					id
					type
					settings_str
				}
				items_page(limit: 1, query_params: { ids: $itemId }) {
					items {
						column_values {
							id
							value
							... on BoardRelationValue {
								linked_item_ids
							}
						}
					}
				}
			}
		}
	`;

	try {
		const response: any = await client.request(query, {
			boardId: [boardId],
			itemId: [itemId],
		});

		if (response.error) {
			console.error("Monday API error in findLinkedItems:", response.error?.message);
			return [];
		}

		const board = response.boards?.[0];
		if (!board) return [];

		const item = board.items_page?.items?.[0];
		if (!item) return [];

		// 1. Identify columns that link to targetBoardId
		const targetColumnIds = board.columns
			.filter((col: any) => col.type === "board_relation" || col.type === "connect_boards")
			.filter((col: any) => {
				try {
					const settings = JSON.parse(col.settings_str || "{}");
					// Monday settings can use boardId, boardIds (array), or board_id
					// We use string comparison to avoid type mismatches (Number vs String)
					const boardIdMatch = settings.boardId?.toString() === targetBoardId.toString();
					const boardIdsMatch = Array.isArray(settings.boardIds) && settings.boardIds.some((id: any) => id.toString() === targetBoardId.toString());
					const board_idMatch = settings.board_id?.toString() === targetBoardId.toString();

					return boardIdMatch || boardIdsMatch || board_idMatch;
				} catch (e) {
					return false;
				}
			})
			.map((col: any) => col.id);

		if (targetColumnIds.length === 0) {
			console.log(`[findLinkedItems] No columns found on board ${boardId} that link to board ${targetBoardId}`);
			return [];
		}

		// 2. Extract item IDs from those columns
		const linkedIds = new Set<string>();
		item.column_values
			.filter((cv: any) => targetColumnIds.includes(cv.id))
			.forEach((cv: any) => {
				// New API behavior (2025-04+): use linked_item_ids field
				if (Array.isArray(cv.linked_item_ids)) {
					cv.linked_item_ids.forEach((id: string | number) => {
						linkedIds.add(id.toString());
					});
				}
				// Fallback for older API behavior or cached values
				else if (cv.value) {
					try {
						const val = JSON.parse(cv.value);
						if (Array.isArray(val.linkedPulseIds)) {
							val.linkedPulseIds.forEach((p: any) => {
								if (p.linkedPulseId) {
									linkedIds.add(p.linkedPulseId.toString());
								}
							});
						}
					} catch (e) {}
				}
			});
		return Array.from(linkedIds);
	} catch (error) {
		console.error("Error in findLinkedItems:", error);
		return [];
	}
}

/**
 * Get item details including parent item and board
 */
export async function getItemDetails(itemId: string) {
	const query = `
		query GetItemDetails($itemId: [ID!]) {
			items(ids: $itemId) {
				id
				name
				group { 
					id 
				}
				board {
					id
					name
				}
				parent_item {
					id
					name
					group { 
						id
					}
					board {
						id
						name
					}
				}
			}
		}
	`;

	try {
		const response: any = await client.request(query, { itemId: [itemId] });
		const item = response.items?.[0];
		if (!item) return null;

		return {
			id: item.id,
			name: item.name,
			groupId: item.group?.id,
			boardId: item.board?.id,
			boardName: item.board?.name,
			parentItemId: item.parent_item?.id,
			parentItemName: item.parent_item?.name,
			parentGroupId: item.parent_item?.group?.id,
			parentBoardId: item.parent_item?.board?.id,
			parentBoardName: item.parent_item?.board?.name,
		};
	} catch (error) {
		console.error("Error in getItemDetails:", error);
		return null;
	}
}
