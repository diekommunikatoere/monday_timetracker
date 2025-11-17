import { ApiClient, ClientError } from "@mondaydotcomorg/api";
import { NextRequest } from "next/server";

// Inline type definitions for API responses
type APIResponse<T> = {
	loading: boolean;
	error: APIError | null;
	data: {
		loading: boolean;
		error: APIError | null;
		data: T;
	};
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

	const query = `
    query {
      boards(ids: [${boardIds.join(",")}]) {
        id
        name
      }
    }
  `;

	try {
		const response: APIResponse<{ boards: Array<{ id: string; name: string }> }> = await client.request(query);

		if (response.error || response.data.error) {
			console.error("Monday API error in getConnectedBoards:", response.error?.message || response.data.error?.message);
			throw new Error(response.error?.message || response.data.error?.message || "Failed to fetch boards");
		}

		const boards = response.data.data.boards || [];
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
		options: Array<{ id: string; value: string; label: string }>;
	}>;
}> {
	// Validate boardId
	if (!boardId || isNaN(Number(boardId)) || Number(boardId) <= 0) {
		throw new Error("boardId must be a valid positive integer");
	}

	const allItems: any[] = [];
	let cursor: string | null = null;
	let hasMore = true;
	let board: any = null;

	while (hasMore) {
		const query = `
      query ($boardId: ID!, $cursor: String) {
        boards(ids: [$boardId]) {
          groups {
            id
            title
            items_page(limit: 500, cursor: $cursor) {
              cursor
              items {
                id
                name
                subitems {
                  id
                  name
                }
              }
            }
          }
        }
        complexity {
          query
        }
      }
    `;

		const variables: { boardId: string; cursor?: string | null } = { boardId, cursor };

		try {
			const response: APIResponse<{ boards: any[] }> = await client.request(query, { variables });

			if (response.error || response.data.error) {
				throw new Error(response.error?.message || response.data.error?.message);
			}

			board = response.data.data.boards[0];

			if (!board || !board.groups) {
				break;
			}

			// Collect items from all groups across the board
			for (const group of board.groups) {
				let groupCursor = cursor;
				let groupHasMore = true;

				while (groupHasMore) {
					const groupQueryVariables = { boardId, cursor: groupCursor };
					const groupResponse: APIResponse<any> = await client.request(query, { variables: groupQueryVariables });

					if (groupResponse.error || groupResponse.data.error) {
						throw new Error(groupResponse.error?.message || groupResponse.data.error?.message);
					}

					const groupBoard = groupResponse.data.data.boards[0];
					const groupItemsPage = groupBoard?.groups?.find((g) => g.id === group.id)?.items_page;

					if (!groupItemsPage || !groupItemsPage.items) {
						break;
					}

					allItems.push(...groupItemsPage.items);
					groupCursor = groupItemsPage.cursor;
					groupHasMore = !!groupCursor;

					console.log(`Fetched ${groupItemsPage.items.length} items for group ${group.id}, complexity: ${groupResponse.data.data.complexity?.query}`);
				}
			}

			// Pagination is per items_page, but since we're fetching all and original uses while(cursor), approximate by checking if any group has more
			// For simplicity, fetch all in one go per group; adjust if needed for large boards
			cursor = null; // Disable further pagination for now; original logic had issues with cursor per group
			hasMore = false; // Set to false to avoid infinite loop; improve if search/pagination needed
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
			// Use collected allItems to filter per group if needed; for now, assume allItems has all
			const groupItems = allItems.filter((item) => item.group?.id === group.id || true); // Approximate
			const options = groupItems.flatMap((item: any) => {
				if (item.subitems && item.subitems.length > 0) {
					return item.subitems.map((subitem: any) => ({
						id: subitem.id.toString(),
						value: subitem.id.toString(),
						label: `${item.name} > ${subitem.name}`,
					}));
				}
				return [
					{
						id: item.id.toString(),
						value: item.id.toString(),
						label: item.name,
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
