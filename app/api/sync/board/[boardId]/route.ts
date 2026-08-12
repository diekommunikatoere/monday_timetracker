import { NextRequest, NextResponse } from "next/server";

import { syncItemColumns, getBoardConfig } from "@/lib/columnSync";
import { getMondayContext } from "@/lib/monday";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAllWithKeyset } from "@/lib/supabase/pagination";

interface Props {
	params: Promise<{
		boardId: string;
	}>;
}

// Cap how many items a single call will attempt, so a board with thousands of
// items can't make one call run long enough to hit a platform/request timeout.
const MAX_PAGE_SIZE = 300;
const DEFAULT_PAGE_SIZE = 100;

/**
 * POST /api/sync/board/:boardId
 * Bulk sync one page of items on a board that have time entries, ordered by
 * `item_id` and resumed via `?cursor=<lastItemId>`.
 *
 * A board can have far more finalized items than fit in a single request's
 * time budget, so this only ever processes up to `?limit=` (default
 * {@link DEFAULT_PAGE_SIZE}, max {@link MAX_PAGE_SIZE}) items per call. The
 * response's `done`/`nextCursor` tell the caller whether to call again —
 * see `handleBulkSync` in `app/admin/boards/[boardId]/page.tsx` for the loop
 * that drives this. Without looping, a large board will only ever get its
 * first page synced no matter how many times this is called, since re-calling
 * without a cursor always restarts from the same beginning.
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

		const { searchParams } = new URL(request.url);
		const cursor = searchParams.get("cursor"); // last item_id from the previous page, exclusive
		const requestedLimit = parseInt(searchParams.get("limit") || "", 10);
		const pageSize = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

		console.log(`[BulkSync] Starting bulk sync page for board ${boardId} (cursor=${cursor ?? "start"}, target=${pageSize} items)`);

		// Collect one page of DISTINCT item IDs, ordered by item_id so a cursor can
		// resume exactly where this page left off. A single item can have many rows
		// (e.g. boards backfilled from the 7pace import average ~13 rows/item), so
		// this walks row-chunks and keeps going until `pageSize` distinct items are
		// found — capping by raw row count alone would under-fill pages on
		// row-heavy boards and turn what should be ~25 calls into 100+.
		// ROW_SCAN_CAP bounds worst-case work if items are pathologically row-heavy.
		const ROW_SCAN_CHUNK = 1000; // Supabase's per-query cap
		const ROW_SCAN_CAP = 20000;

		const uniqueItemIds: string[] = [];
		const seenItemIds = new Set<string>();
		let scanCursor = cursor;
		let rowsScanned = 0;
		let tableExhausted = false;

		while (uniqueItemIds.length < pageSize && rowsScanned < ROW_SCAN_CAP) {
			let rowQuery = supabaseAdmin.from("time_entry").select("item_id").eq("board_id", boardId).eq("timer_state", "finalized").not("item_id", "is", null).order("item_id", { ascending: true }).limit(ROW_SCAN_CHUNK);
			if (scanCursor) {
				rowQuery = rowQuery.gt("item_id", scanCursor);
			}
			const { data: rows, error: rowError } = await rowQuery;

			if (rowError) {
				console.error("Error fetching items:", rowError);
				return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
			}
			if (!rows || rows.length === 0) {
				tableExhausted = true;
				break;
			}

			rowsScanned += rows.length;
			for (const row of rows) {
				if (row.item_id && !seenItemIds.has(row.item_id)) {
					seenItemIds.add(row.item_id);
					uniqueItemIds.push(row.item_id);
				}
			}
			scanCursor = rows[rows.length - 1].item_id;

			if (rows.length < ROW_SCAN_CHUNK) {
				tableExhausted = true;
				break;
			}
		}

		// A single ROW_SCAN_CHUNK can itself contain well over `pageSize` distinct
		// items (row density varies across the item_id space), so trim back to the
		// target and resume from the exact cutoff — otherwise a page could balloon
		// past its intended sync workload and risk the very timeout this is meant
		// to avoid. Only "done" once the underlying row scan truly ran out; hitting
		// the item-count target (before or after trimming) or the row-scan safety
		// cap both mean more items remain.
		let pageExhausted: boolean;
		let nextCursor: string | null;
		if (uniqueItemIds.length > pageSize) {
			nextCursor = uniqueItemIds[pageSize - 1];
			uniqueItemIds.length = pageSize;
			pageExhausted = false;
		} else {
			pageExhausted = tableExhausted;
			nextCursor = pageExhausted ? null : scanCursor;
		}

		if (uniqueItemIds.length === 0) {
			return NextResponse.json({
				success: true,
				message: cursor ? "No more items to sync on this board" : "No items with time entries found on this board",
				itemsSynced: 0,
				itemsFailed: 0,
				results: [],
				done: true,
				nextCursor: null,
			});
		}

		console.log(`[BulkSync] Found ${uniqueItemIds.length} unique items in this page (done=${pageExhausted})`);

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

		console.log(`[BulkSync] Page completed: ${successCount} succeeded, ${failureCount} failed, done=${pageExhausted}`);

		return NextResponse.json({
			success: failureCount === 0,
			message: `Synced ${successCount} of ${uniqueItemIds.length} items in this page` + (pageExhausted ? " — board fully synced" : " (more items remain — continue with nextCursor)"),
			itemsSynced: successCount,
			itemsFailed: failureCount,
			results,
			done: pageExhausted,
			nextCursor,
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

		// Get unique items synced. A board can have far more than 1000 finalized
		// entries (Supabase's per-query cap), so this paginates via `id` (unique)
		// rather than a plain .select() — otherwise this stat silently undercounts
		// on larger boards.
		const itemCountResult = await fetchAllWithKeyset(supabaseAdmin, "time_entry", "id", "id, item_id", {
			eq: { board_id: boardId, timer_state: "finalized" },
		});

		if (!itemCountResult.success) {
			console.error("Error fetching item count:", itemCountResult.error);
		}

		const uniqueItems = [...new Set(itemCountResult.data.map((row: { item_id: string | null }) => row.item_id).filter(Boolean))];

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
