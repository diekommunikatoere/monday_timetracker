// app/api/time-entries/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { updateTimeEntry, softDeleteTimeEntry, getTimeEntryById } from "@/lib/database";
import { syncAfterUpdate, syncAfterDelete } from "@/lib/columnSync";

/**
 * PATCH /api/time-entries/[id]
 * Update an existing time entry with optimistic locking
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Get user ID for user authentication
		const userId = request.headers.get("userId");
		if (!userId) {
			return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
		}

		const paramsData = await params;
		const id = await paramsData.id;
		const body = await request.json();
		const { expectedUpdatedAt, ...updates } = body;

		console.log("[API] PATCH request:", request);
		console.log("params: ", paramsData);
		console.log("[API] Updating time entry:", id, "with updates:", updates, "by user:", userId);

		// Update time entry with optimistic locking
		try {
			const { old: oldEntry, new: newEntry } = await updateTimeEntry(id, updates, userId, expectedUpdatedAt);

			// Queue sync operations (non-blocking)
			syncAfterUpdate(newEntry, oldEntry, userId).catch((err) => {
				console.error("[API] Error queueing sync after update:", err);
			});

			return NextResponse.json({
				success: true,
				data: newEntry,
			});
		} catch (error: any) {
			// Handle optimistic locking conflict
			if (error.code === "CONFLICT" || error.statusCode === 409) {
				return NextResponse.json(
					{
						error: "Concurrent modification detected",
						message: "This entry was modified by another user. Please refresh and try again.",
					},
					{ status: 409 }
				);
			}
			throw error;
		}
	} catch (error: any) {
		console.error("[API] Error updating time entry:", error);
		return NextResponse.json({ error: error.message || "Failed to update time entry" }, { status: 500 });
	}
}

/**
 * DELETE /api/time-entries/[id]
 * Soft-delete a time entry with undo support
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Get user ID for user authentication
		const userId = request.headers.get("userId");

		if (!userId) {
			return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
		}

		const paramsData = await params;
		const id = await paramsData.id;

		// Soft delete the entry
		const { entry, undoToken } = await softDeleteTimeEntry(id, userId);

		// Queue sync operation (non-blocking)
		syncAfterDelete(entry, userId).catch((err) => {
			console.error("[API] Error queueing sync after delete:", err);
		});

		return NextResponse.json({
			success: true,
			deleted: true,
			undoToken,
			message: "Entry deleted successfully",
		});
	} catch (error: any) {
		console.error("[API] Error deleting time entry:", error);
		return NextResponse.json({ error: error.message || "Failed to delete time entry" }, { status: 500 });
	}
}
