// app/api/cron/cleanup-soft-deletes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cleanupOrphanedSoftDeletes } from "@/lib/database";
import { syncAfterDelete } from "@/lib/columnSync";
import { cacheHelper } from "@/lib/redis";

/**
 * GET /api/cron/cleanup-soft-deletes
 * Cleanup orphaned soft-deleted entries
 * Called by cron job every minute
 */
export async function GET(request: NextRequest) {
	try {
		// Verify cron secret for security
		const authHeader = request.headers.get("authorization");
		const cronSecret = process.env.CRON_SECRET;

		if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Cleanup orphaned soft-deletes
		const deletedEntries = await cleanupOrphanedSoftDeletes();

		// Process Redis hard_delete keys
		const hardDeleteKeys = await cacheHelper.keys("hard_delete:*");
		let processedFromRedis = 0;

		for (const key of hardDeleteKeys) {
			try {
				const data = await cacheHelper.get<string>(key);
				if (data) {
					const { itemId, boardId, userId } = JSON.parse(data);

					// Queue for sync
					if (itemId && boardId && userId) {
						await syncAfterDelete({ item_id: itemId, board_id: boardId, id: key.replace("hard_delete:", "") }, userId);
						processedFromRedis++;
					}
				}

				// Delete the Redis key
				await cacheHelper.del(key);
			} catch (err) {
				console.error(`[Cleanup] Error processing Redis key ${key}:`, err);
			}
		}

		// Queue deleted entries for sync
		for (const entry of deletedEntries) {
			try {
				await syncAfterDelete(entry, entry.user_id);
			} catch (err) {
				console.error(`[Cleanup] Error queueing sync for entry ${entry.id}:`, err);
			}
		}

		return NextResponse.json({
			success: true,
			orphanedDeleted: deletedEntries.length,
			redisProcessed: processedFromRedis,
			timestamp: new Date().toISOString(),
		});
	} catch (error: any) {
		console.error("[Cleanup] Error in cleanup job:", error);
		return NextResponse.json({ error: error.message || "Cleanup job failed" }, { status: 500 });
	}
}
