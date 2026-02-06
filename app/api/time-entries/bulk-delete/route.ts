import { NextRequest, NextResponse } from "next/server";
import { softDeleteTimeEntry } from "@/lib/database";
import { syncAfterDelete } from "@/lib/columnSync";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";

/**
 * POST /api/time-entries/bulk-delete
 * Bulk delete time entries with batching
 */
export async function POST(request: NextRequest) {
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

		// Get user profile
		const userProfile = await getUserProfileByMondayId(session.userId);
		if (!userProfile) {
			return NextResponse.json({ error: "User not found" }, { status: 404 });
		}

		const userId = userProfile.id;

		const body = await request.json();
		const { entryIds } = body;

		if (!Array.isArray(entryIds) || entryIds.length === 0) {
			return NextResponse.json({ error: "Invalid entry IDs" }, { status: 400 });
		}

		const BATCH_SIZE = 20;
		const results = {
			success: 0,
			failed: 0,
			errors: [] as string[],
		};

		// Process in batches
		for (let i = 0; i < entryIds.length; i += BATCH_SIZE) {
			const batch = entryIds.slice(i, i + BATCH_SIZE);

			// Process batch in parallel
			const batchResults = await Promise.allSettled(
				batch.map(async (id: string) => {
					const { entry } = await softDeleteTimeEntry(id, userId);

					// Queue sync (non-blocking)
					syncAfterDelete(entry, userId).catch((err) => {
						console.error(`[API] Error queueing sync for entry ${id}:`, err);
					});

					return entry;
				}),
			);

			// Count results
			batchResults.forEach((result, index) => {
				if (result.status === "fulfilled") {
					results.success++;
				} else {
					results.failed++;
					results.errors.push(`Entry ${batch[index]}: ${result.reason?.message || "Unknown error"}`);
				}
			});
		}

		return NextResponse.json({
			success: true,
			deleted: results.success,
			failed: results.failed,
			errors: results.errors.length > 0 ? results.errors : undefined,
		});
	} catch (error: any) {
		console.error("[API] Error bulk deleting time entries:", error);
		return NextResponse.json({ error: error.message || "Failed to bulk delete time entries" }, { status: 500 });
	}
}
