import { NextRequest, NextResponse } from "next/server";
import { getMondayContext } from "@/lib/monday";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncItemColumns, getBoardConfig } from "@/lib/columnSync";
import { verifyMondayJwt } from "@/lib/monday-auth";

interface Props {
	params: Promise<{
		boardId: string;
	}>;
}

/**
 * POST /api/sync/board/:boardId
 * Bulk sync all items on a board that have time entries
 */
export async function POST(request: NextRequest, { params }: Props) {
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

		// Get the Supabase user ID from the Monday user ID
		const { data: userProfile, error: userError } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", session.userId).single();

		if (userError || !userProfile) {
			console.error("Error fetching user profile:", userError);
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		const { boardId } = await params;

		// Check if board config exists and sync is enabled
		const boardConfig = await getBoardConfig(boardId);
		if (!boardConfig) {
			return NextResponse.json({ error: "Board configuration not found. Please configure sync settings first." }, { status: 404 });
		}

		if (!boardConfig.syncEnabled) {
			return NextResponse.json({ error: "Sync is disabled for this board" }, { status: 400 });
		}

		console.log(`[BulkSync] Starting bulk sync for board ${boardId}`);

		// Get all unique item IDs that have time entries on this board
		const { data: itemIds, error: itemError } = await supabaseAdmin.from("time_entry").select("item_id").eq("board_id", boardId).eq("timer_state", "finalized").not("item_id", "is", null);

		if (itemError) {
			console.error("Error fetching items:", itemError);
			return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
		}

		// Get unique item IDs
		const uniqueItemIds = [...new Set(itemIds?.map((row) => row.item_id).filter(Boolean) as string[])];

		if (uniqueItemIds.length === 0) {
			return NextResponse.json({
				success: true,
				message: "No items with time entries found on this board",
				itemsSynced: 0,
				results: [],
			});
		}

		console.log(`[BulkSync] Found ${uniqueItemIds.length} unique items to sync`);

		// Sync each item (with rate limiting to avoid API overload)
		const results: Array<{
			itemId: string;
			success: boolean;
			columnsUpdated: number;
			errors: string[];
		}> = [];

		const BATCH_SIZE = 5; // Process 5 items at a time
		const DELAY_BETWEEN_BATCHES = 1000; // 1 second delay between batches

		for (let i = 0; i < uniqueItemIds.length; i += BATCH_SIZE) {
			const batch = uniqueItemIds.slice(i, i + BATCH_SIZE);

			const batchPromises = batch.map(async (itemId) => {
				try {
					const syncResult = await syncItemColumns(itemId, boardId, userProfile.id);
					return {
						itemId,
						success: syncResult.overallSuccess,
						columnsUpdated: syncResult.results.filter((r) => r.success).length,
						errors: syncResult.results.filter((r) => !r.success).map((r) => r.error || "Unknown error"),
					};
				} catch (error) {
					return {
						itemId,
						success: false,
						columnsUpdated: 0,
						errors: [error instanceof Error ? error.message : "Unknown error"],
					};
				}
			});

			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);

			// Add delay between batches to avoid rate limiting
			if (i + BATCH_SIZE < uniqueItemIds.length) {
				await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
			}
		}

		const successCount = results.filter((r) => r.success).length;
		const failureCount = results.filter((r) => !r.success).length;

		console.log(`[BulkSync] Completed: ${successCount} succeeded, ${failureCount} failed`);

		return NextResponse.json({
			success: failureCount === 0,
			message: `Synced ${successCount} of ${uniqueItemIds.length} items`,
			itemsSynced: successCount,
			itemsFailed: failureCount,
			results,
		});
	} catch (error) {
		console.error("Error in bulk sync endpoint:", error);
		return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
	}
}

/**
 * GET /api/sync/board/:boardId
 * Get sync statistics and recent history for a board
 */
export async function GET(request: NextRequest, { params }: Props) {
	try {
		// Authenticate user from Monday context
		const context = await getMondayContext(request);
		if (!context?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { boardId } = await params;
		const { searchParams } = new URL(request.url);
		const limit = parseInt(searchParams.get("limit") || "50", 10);

		// Get board config
		const boardConfig = await getBoardConfig(boardId);

		// Get recent sync history
		const { data: syncHistory, error: historyError } = await supabaseAdmin.from("sync_log").select("*").eq("board_id", boardId).order("created_at", { ascending: false }).limit(limit);

		if (historyError) {
			console.error("Error fetching sync history:", historyError);
		}

		// Get sync statistics
		const { data: stats, error: statsError } = await supabaseAdmin
			.from("sync_log")
			.select("success, created_at")
			.eq("board_id", boardId)
			.gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours

		if (statsError) {
			console.error("Error fetching sync stats:", statsError);
		}

		const successCount = stats?.filter((s) => s.success).length || 0;
		const failureCount = stats?.filter((s) => !s.success).length || 0;

		// Get unique items synced
		const { data: itemCount, error: itemCountError } = await supabaseAdmin.from("time_entry").select("item_id").eq("board_id", boardId).eq("timer_state", "finalized").not("item_id", "is", null);

		if (itemCountError) {
			console.error("Error fetching item count:", itemCountError);
		}

		const uniqueItems = [...new Set(itemCount?.map((row) => row.item_id).filter(Boolean))];

		return NextResponse.json({
			boardId,
			config: boardConfig
				? {
						syncEnabled: boardConfig.syncEnabled,
					}
				: null,
			statistics: {
				last24Hours: {
					successCount,
					failureCount,
					totalSyncs: successCount + failureCount,
				},
				itemsWithTimeEntries: uniqueItems.length,
			},
			recentHistory: syncHistory || [],
		});
	} catch (error) {
		console.error("Error in sync status endpoint:", error);
		return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
	}
}
