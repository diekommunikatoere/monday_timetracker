// lib/monday.ts — monday.com GraphQL API client: boards, items, subitems, user details, linked items.

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
/** Generic wrapper returned by the monday.com `ApiClient` before unwrapping. */
type APIResponse<T> = {
	loading: boolean;
	error: APIError | null;
	data: T;
};

/** Raw shape returned by the `boards(ids: [...])` query used in {@link getConnectedBoards}. */
type BoardsResponse = {
	boards: Array<{
		id: string;
		name: string;
	}>;
	error?: APIError;
};

/**
 * A monday item fetched **without** subitems — used in the Phase 1 low-complexity
 * items query inside {@link getBoardTasks} to keep the per-request complexity budget low.
 */
type SimpleItem = {
	id: string;
	name: string;
};

/**
 * A monday item with its subitems pre-fetched. Used in the legacy high-complexity
 * query path; the current implementation uses a dedicated subitems-board query instead.
 */
type ItemWithSubitems = {
	id: string;
	subitems: Array<{
		id: string;
		name: string;
	}>;
};

/**
 * Paginated response shape for the `boards.groups.items_page` query used in Phase 1
 * of {@link getBoardTasks}. The `cursor` field drives subsequent `next_items_page` calls.
 */
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

/**
 * Paginated response shape for the subitems query in Phase 2 of {@link getBoardTasks}.
 * Each item carries its `parent_item.id` so subitems can be bucketed by parent.
 */
type SubitemsResponse = {
	items: ItemWithSubitems[];
	complexity?: {
		query: number;
	};
	error?: APIError;
};

/**
 * Legacy combined response that fetched items and subitems in a single high-complexity
 * query. Retained for type compatibility; the active code path uses two separate queries.
 */
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

/** Error shape returned inline by monday.com API responses (not thrown). */
type APIError = {
	message: string;
	status: number;
	errors?: Array<{
		message: string;
		path?: string[];
	}>;
};

/**
 * A board flattened to a `{ value, label }` pair for use in select inputs and caching.
 * `value` is the board's monday.com ID (string); `label` is the board name.
 */
type BoardOption = { value: string; label: string };

/**
 * A grouped list of task options ready for a grouped `<Select>` component.
 * Each entry represents one monday board group; `options` contains the items
 * (or subitems, with their parent name prepended) within that group.
 *
 * Subitems are labelled `"<parentName> > <subitemName>"` and carry
 * `parentItemId` / `parentItemName` for later look-ups.
 */
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

/**
 * Accumulator used during the Phase 1 pagination loop in {@link getBoardTasks}.
 * Groups are collected before subitems are fetched so both phases can be joined
 * without re-fetching.
 */
type GroupItems = {
	groupId: string;
	groupTitle: string;
	groupPosition: string; // Numeric string; used for sort ordering
	items: SimpleItem[];
};

/**
 * A minimal monday.com item reference returned by {@link findLinkedItems}.
 *
 * @property id      - monday.com item ID.
 * @property boardId - ID of the board the item belongs to.
 */
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

/**
 * Resolves a list of monday.com board IDs to their names, for use in board-selection UIs.
 *
 * Results are cached in Redis under `monday:boards:<sorted-ids>` for
 * {@link CACHE_TTL.BOARDS} seconds (1 hour). As a side-effect, each board is
 * upserted into the local `monday_board` dimension table (fire-and-forget).
 *
 * @param boardIds - monday.com board IDs to look up. Empty / invalid input returns `[]`.
 * @returns An array of `{ value: boardId, label: boardName }` options, in API-response order.
 */
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

/**
 * One workspace's worth of boards, grouped for the admin board picker.
 *
 * @property workspaceId   - monday workspace ID, or `"__default__"` for boards with no workspace.
 * @property workspaceName - Display name; `"Hauptbereich"` for the default bucket.
 * @property boards        - Boards in this workspace, alphabetically sorted.
 */
export interface WorkspaceBoardGroup {
	workspaceId: string;
	workspaceName: string;
	boards: Array<{ value: string; label: string; kind: string }>;
}

const ALL_BOARDS_CACHE_KEY = "monday:all_boards_grouped";
const ALL_BOARDS_CACHE_TTL = 60 * 15; // 15 minutes

/**
 * Fetches every active board across all workspaces in the account, grouped by
 * workspace, for the admin "Boards verwalten" picker.
 *
 * Pages through monday's `boards` query with `page:` (not cursor-based, unlike
 * {@link getBoardTasks}'s `items_page`) until an empty page is returned. Filters
 * to `state: active` and `type: "board"` — monday's `BoardObjectType` is one of
 * `board` / `custom_object` / `document` / `sub_items_board`, so restricting to
 * `board` keeps real boards (of any `board_kind`, including `share`) while
 * excluding sub-items boards, workdocs, and custom objects in a single pass with
 * no per-board sub-query.
 *
 * Results are cached in Redis under `monday:all_boards_grouped` for 15 minutes.
 * As a side-effect, every discovered board is upserted into the local
 * `monday_board` dimension table (fire-and-forget).
 *
 * @returns Workspace-grouped board options, sorted by workspace name then board name.
 */
export async function getAllBoardsGroupedByWorkspace(): Promise<WorkspaceBoardGroup[]> {
	const cached = await cacheHelper.get<WorkspaceBoardGroup[]>(ALL_BOARDS_CACHE_KEY);
	if (cached) {
		return cached;
	}

	type BoardsPageResponse = {
		boards: Array<{
			id: string;
			name: string;
			type: string;
			board_kind: string;
			workspace: { id: string; name: string } | null;
		}>;
		error?: APIError;
	};

	const query = `
		query ($page: Int!) {
			boards(limit: 100, page: $page, state: active) {
				id
				name
				type
				board_kind
				workspace {
					id
					name
				}
			}
		}
	`;

	const allBoards: BoardsPageResponse["boards"] = [];
	let page = 1;
	// monday's `boards` query paginates with `page:`, not a cursor — loop until an empty page.
	while (true) {
		const response: BoardsPageResponse = await client.request(query, { page });

		if (response.error) {
			throw new Error(response.error?.message || "Failed to fetch boards");
		}

		const pageBoards = response.boards || [];
		if (pageBoards.length === 0) break;

		// Only real boards belong in the picker; `type` excludes sub-items boards, workdocs, and custom objects.
		allBoards.push(...pageBoards.filter((b) => b.type === "board"));

		if (pageBoards.length < 100) break;
		page += 1;
	}

	// Upsert boards into dimension table (fire-and-forget)
	Promise.all(allBoards.map((b) => upsertMondayBoard(b.id.toString(), b.name))).catch((err) => console.error("[getAllBoardsGroupedByWorkspace] Background upsert error:", err));

	const DEFAULT_WORKSPACE_ID = "__default__";
	const groups = new Map<string, WorkspaceBoardGroup>();

	for (const board of allBoards) {
		const workspaceId = board.workspace?.id?.toString() || DEFAULT_WORKSPACE_ID;
		const workspaceName = board.workspace?.name || "Hauptbereich";

		if (!groups.has(workspaceId)) {
			groups.set(workspaceId, { workspaceId, workspaceName, boards: [] });
		}
		groups.get(workspaceId)!.boards.push({ value: board.id.toString(), label: board.name, kind: board.board_kind });
	}

	const result = Array.from(groups.values())
		.map((group) => ({ ...group, boards: group.boards.sort((a, b) => a.label.localeCompare(b.label)) }))
		.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));

	await cacheHelper.set(ALL_BOARDS_CACHE_KEY, result, ALL_BOARDS_CACHE_TTL);
	return result;
}

/**
 * Detects a Monday "subitems board" — the auto-generated board that holds an
 * item's subitems. Such a board must never be fetched as a normal board:
 * getBoardTasks would persist its subitems as top-level items (board_id = the
 * subitems board, parent_item_id = null), corrupting the dimension table. The
 * reliable signal is that every item on a subitems board has a parent_item,
 * which a normal board's items never do.
 *
 * Returns false on any error so a transient API failure can't misclassify a real
 * board as a subitems board (which would silently hide all its tasks).
 */
export async function isSubitemsBoard(boardId: string): Promise<boolean> {
	const query = `
		query ($boardId: ID!) {
			boards(ids: [$boardId]) {
				items_page(limit: 1) {
					items {
						parent_item {
							id
						}
					}
				}
			}
		}
	`;

	try {
		const response: any = await client.request(query, { boardId });
		const firstItem = response.boards?.[0]?.items_page?.items?.[0];
		return !!firstItem?.parent_item?.id;
	} catch (error) {
		console.error(`[isSubitemsBoard] Failed to check board ${boardId}:`, error);
		return false;
	}
}

/**
 * Fetches all items and subitems for a board and returns them as grouped
 * `TaskGroup` options, sorted by group position then alphabetically within each group.
 *
 * **Two-phase strategy** to stay within monday's complexity budget:
 * - **Phase 1** — fetches all items (no subitems) via `items_page` with cursor-based
 *   pagination, 200 items per page.
 * - **Phase 2** — discovers the auto-generated subitems board for this board, then
 *   paginates its items directly (200 per page). Each subitem carries `parent_item.id`
 *   so subitems can be bucketed by parent without a costly `items(ids:[...])` batch call.
 *
 * **Subitems-board guard**: if `boardId` itself is a subitems board (detected via
 * {@link isSubitemsBoard}), the function returns `{ groups: [] }` immediately rather
 * than flattening subitems as top-level items, which would corrupt the dimension table.
 *
 * As a side-effect, all discovered items and subitems are batch-upserted into the
 * `monday_item` table (fire-and-forget via {@link upsertMondayItemsBatch}).
 *
 * @param boardId    - Valid positive-integer monday.com board ID (string form).
 * @param searchTerm - Reserved parameter; not currently applied server-side.
 * @returns `{ groups }` where each group's `options` are the items/subitems inside it.
 * @throws If `boardId` is not a valid positive integer, or on unrecoverable API errors.
 */
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

	// Guard: never treat a subitems board as a normal board. Its items are
	// subitems; fetching them here would flatten them into top-level rows with a
	// null parent_item_id and the subitems board as board_id. Subitems are synced
	// correctly via Phase 2 when their *parent* board is fetched.
	if (await isSubitemsBoard(boardId)) {
		console.warn(`[getBoardTasks] Board ${boardId} is a subitems board; refusing to fetch its items as top-level tasks.`);
		return { groups: [] };
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

/**
 * Fetches board tasks for multiple boards **sequentially** (not in parallel) to
 * avoid saturating monday's per-account API complexity budget.
 *
 * Boards that fail individually are logged and stored as `{ groups: [] }` in the
 * result so a single bad board does not abort the batch.
 *
 * @param boardIds - monday.com board IDs to pre-fetch.
 * @returns A `Map<boardId, { groups }>` with an entry for every input board ID.
 */
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

/**
 * Clears all Redis board caches matching `monday:boards:*`.
 *
 * Use when a board name changes or when forcing a cold refresh for all
 * boards (e.g. after an admin sync operation).
 */
export async function invalidateAllBoardCaches(): Promise<void> {
	await cacheHelper.clearPattern("monday:boards:*");
	console.log("[invalidateAllBoardCaches] Cleared all monday caches");
}

/**
 * Parses the legacy `monday-context` request header and returns the decoded context data.
 *
 * **Deprecated path** — only used by `/api/sync/board/[boardId]`. All other routes
 * should use the JWT-based pattern via {@link verifyMondayJwt} in `lib/monday-auth.ts`.
 *
 * @param request - The incoming Next.js request with a `monday-context` header.
 * @returns The `data` field of the decoded context object.
 * @throws If the header is absent or the JSON is invalid / missing `user.id` or `account.id`.
 */
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

/**
 * Fetches a monday.com user's team memberships and profile photo URLs.
 *
 * Results are cached under `monday:user_details:<userId>` for
 * {@link CACHE_TTL.USER_TEAMS} seconds (24 hours) — team membership is
 * treated as stable.
 *
 * On any API error the function **does not throw** — it returns empty teams
 * and `null` photo URLs so callers can degrade gracefully.
 *
 * @param userId - monday.com user ID (string).
 * @returns Object with `teams` (id + name pairs) and `photo_urls` at five sizes.
 *          All `photo_urls` values are `null` if the user has no avatar.
 */
export async function getUserDetails(userId: string): Promise<{
	name: string | null;
	email: string | null;
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
			name: null,
			email: null,
			teams: [],
			photo_urls: { original: null, small: null, thumb: null, thumb_small: null, tiny: null },
		};
	}

	const startTime = Date.now();
	const cacheKey = `monday:user_details:${userId}`;

	// Try cache first
	const cached = await cacheHelper.get<{
		name: string | null;
		email: string | null;
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
				name
				email
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
		let name: string | null = null;
		let email: string | null = null;
		let teams: Array<{ id: string; name: string }> = [];
		let photo_urls = {
			original: null,
			small: null,
			thumb: null,
			thumb_small: null,
			tiny: null,
		};

		if (users.length > 0) {
			name = users[0].name ?? null;
			email = users[0].email ?? null;
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

		const result = { name, email, teams, photo_urls };

		// Cache the result
		await cacheHelper.set(cacheKey, result, CACHE_TTL.USER_TEAMS);

		console.log(`[getUserDetails] API fetch complete - ${Date.now() - startTime}ms`);
		return result;
	} catch (error) {
		console.error("Error in getUserDetails:", error);
		return {
			name: null,
			email: null,
			teams: [],
			photo_urls: { original: null, small: null, thumb: null, thumb_small: null, tiny: null },
		};
	}
}

/**
 * Convenience wrapper around {@link getUserDetails} that returns only the `teams` array.
 *
 * Shares the same 24-hour Redis cache. Returns `[]` if `userId` is falsy
 * or on any API error.
 *
 * @param userId - monday.com user ID.
 * @returns Array of `{ id, name }` team objects the user belongs to.
 */
export async function getUserTeams(userId: string): Promise<Array<{ id: string; name: string }>> {
	const details = await getUserDetails(userId);
	return details.teams;
}

/**
 * Returns the IDs of items on `targetBoardId` that are linked to `itemId` on `boardId`
 * via `connect_boards` / `board_relation` columns.
 *
 * **Algorithm**:
 * 1. Fetches all columns on `boardId` and filters to those of type `board_relation` /
 *    `connect_boards` whose `settings_str` JSON references `targetBoardId`.
 * 2. Reads the `column_values` for `itemId`, extracting item IDs from those columns.
 *    - Prefers the `linked_item_ids` field (monday API 2025-04+).
 *    - Falls back to parsing `linkedPulseIds` from the raw `value` JSON for older responses.
 *
 * On any error (missing params, API failure) returns `[]` rather than throwing.
 *
 * @param boardId       - Source board containing `itemId`.
 * @param itemId        - The item whose linked items you want.
 * @param targetBoardId - Only links pointing at this board are returned.
 * @returns Array of monday.com item ID strings on `targetBoardId`.
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
 * Fetches structural metadata for a single monday.com item.
 *
 * Returns the item's board, group, and — if it is a subitem — its parent
 * item's board and group. This is used to resolve where a subitem lives
 * when the webhook payload omits the parent context.
 *
 * Returns `null` on any API error or if the item does not exist.
 *
 * @param itemId - monday.com item ID.
 * @returns Flat object with `id`, `name`, `groupId`, `boardId`, `boardName`,
 *          and optional `parentItemId`, `parentItemName`, `parentGroupId`,
 *          `parentBoardId`, `parentBoardName`. `null` if not found.
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
