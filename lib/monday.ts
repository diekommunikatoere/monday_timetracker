import { ApiClient, ClientError } from "@mondaydotcomorg/api";
import { NextRequest } from "next/server";

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

// Ensure MONDAY_API_TOKEN is set
const token = process.env.MONDAY_API_TOKEN;
if (!token) {
	throw new Error("MONDAY_API_TOKEN is not set in environment variables");
}

// Create client instance once
const client = new ApiClient({ token, apiVersion: "2025-10" });

// Get connected boards by IDs
export async function getConnectedBoards(boardIds: string[]): Promise<Array<{ value: string; label: string }>> {
	if (!boardIds || !Array.isArray(boardIds) || boardIds.length === 0) {
		return [];
	}

	console.log("[getConnectedBoards - monday.ts] -----------------------------------");
	console.log("Fetching connected boards for IDs:", boardIds);

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

		console.log("[getConnectedBoards - monday.ts] Response:", response);

		if (response.error) {
			console.error("Monday API error in getConnectedBoards:", response.error?.message);
			console.log("[getConnectedBoards - monday.ts] Full response on error:", response);
			throw new Error(response.error?.message || "Failed to fetch boards");
		}

		const boards = response.boards || [];
		return boards.map((board) => ({
			value: board.id.toString(),
			label: board.name,
		}));
	} catch (error) {
		if (error instanceof ClientError) {
			console.error("ClientError in getConnectedBoards:", error.response?.errors);
		}
		console.error("Error in getConnectedBoards:", error);
		throw new Error("Failed to fetch connected boards");
	}
}

// Get tasks (items and subitems) for a board with pagination (searchTerm handling prepared but not used in query yet)
export async function getBoardTasks(
	boardId: string,
	searchTerm?: string
): Promise<{
	groups: Array<{
		label: string;
		options: Array<{ id: string; value: string; label: string; name: string; parentItemId?: string; parentItemName?: string }>;
	}>;
}> {
	// Validate boardId
	if (!boardId || isNaN(Number(boardId)) || Number(boardId) <= 0) {
		throw new Error("boardId must be a valid positive integer");
	}

	const itemsByGroup: Map<string, any[]> = new Map();
	let cursor: string | null = null;
	let hasMore = true;
	let board: any = null;

	console.log("[getBoardTasks - monday.ts] -----------------------------------");
	console.log("Fetching connected boards for ID:", boardId);
	console.log("boardId type:", typeof boardId);

	while (hasMore) {
		const query = `query ($boardId: ID!, $cursor: String) {boards (ids: [$boardId]) {groups {id title items_page( limit: 500, cursor: $cursor ) {cursor items { id name subitems {id name} } } } } complexity { query } }`;

		const variables: { boardId: string; cursor?: string | null } = { boardId };
		if (cursor) {
			variables.cursor = cursor;
		}
		console.log("Query variables:", variables);
		try {
			const response: TasksResponse = await client.request(query, variables);

			if (response.error) {
				throw new Error(response.error?.message || "Failed to fetch tasks");
			}

			board = response.boards[0];

			console.log("Fetched board data:", board);

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

	const groupedOptions = board.groups
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
		.filter((group) => group.options.length > 0);

	return { groups: groupedOptions };
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
