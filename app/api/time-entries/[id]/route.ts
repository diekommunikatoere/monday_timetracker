import { NextRequest, NextResponse } from "next/server";
import { updateTimeEntry, softDeleteTimeEntry, getTimeEntryById } from "@/lib/database";
import { syncAfterUpdate, syncAfterDelete } from "@/lib/columnSync";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";

/**
 * PATCH /api/time-entries/[id]
 * Update an existing time entry with optimistic locking
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Validate session
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Ungültige Sitzung" }, { status: 401 });
		}

		// Get user profile
		const userProfile = await getUserProfileByMondayId(session.userId);
		if (!userProfile) {
			return NextResponse.json({ error: "Benutzer konnte nicht gefunden werden" }, { status: 404 });
		}

		const userId = userProfile.id;

		const paramsData = await params;
		const id = await paramsData.id;
		const body = await request.json();
		const { expectedUpdatedAt, ...updates } = body;

		console.log("[API] Updating time entry:", id, "with updates:", updates, "by user:", userId);

		// board_id/item_id/role_id are only required for finalized entries. A parked
		// (draft) entry is commonly edited via the reduced draft form, which sends only
		// time fields + comment and leaves an unassigned task/role as-is. The entry's
		// actual timer_state is looked up server-side rather than trusted from the
		// request — the client can't be relied on to honestly declare which case this
		// is, since that would let a caller bypass the requirement for a finalized
		// entry simply by shaping the payload (or a claimed flag) like a draft edit.
		const existingEntry = await getTimeEntryById(id);
		if (!existingEntry) {
			return NextResponse.json({ error: "Zeiteintrag nicht gefunden" }, { status: 404 });
		}

		if (existingEntry.timer_state === "finalized") {
			const { board_id, item_id, role_id } = updates;

			if (!board_id || !item_id) {
				return NextResponse.json({ error: "Ungültige Aufgaben- oder Board-ID." }, { status: 400 });
			}

			if (!role_id) {
				return NextResponse.json({ error: "Ungültige Rollen-ID." }, { status: 400 });
			}
		}

		// Update time entry with optimistic locking
		try {
			const { old: oldEntry, new: newEntry } = await updateTimeEntry(id, updates, userId, expectedUpdatedAt);

			// A parked-to-parked edit can't change monday totals — aggregation RPCs only
			// count timer_state = 'finalized' entries — so skip queuing a no-op sync.
			if (newEntry.timer_state === "finalized" || oldEntry.timer_state === "finalized") {
				syncAfterUpdate(newEntry, oldEntry, userId).catch((err) => {
					console.error("[API] Error queueing sync after update:", err);
				});
			}

			return NextResponse.json({
				success: true,
				data: newEntry,
			});
		} catch (error: any) {
			// Handle optimistic locking conflict
			if (error.code === "CONFLICT" || error.statusCode === 409) {
				return NextResponse.json(
					{
						error: "Konkurrenzänderung erkannt",
						message: "Dieser Eintrag wurde von einem anderen Benutzer geändert. Bitte aktualisieren Sie die Seite und versuchen Sie es erneut.",
					},
					{ status: 409 },
				);
			}
			throw error;
		}
	} catch (error: any) {
		console.error("[API] Error updating time entry:", error);
		return NextResponse.json({ error: error.message || "Fehler beim Aktualisieren des Zeiteintrags" }, { status: 500 });
	}
}

/**
 * DELETE /api/time-entries/[id]
 * Soft-delete a time entry with undo support
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		// Validate session
		const authHeader = request.headers.get("authorization");
		if (!authHeader) {
			return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
		}

		const session = verifyMondayJwt(authHeader);
		if (!session.isValid) {
			return NextResponse.json({ error: "Ungültige Sitzung" }, { status: 401 });
		}

		// Get user profile
		const userProfile = await getUserProfileByMondayId(session.userId);
		if (!userProfile) {
			return NextResponse.json({ error: "Benutzer konnte nicht gefunden werden" }, { status: 404 });
		}

		const userId = userProfile.id;

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
			message: "Eintrag erfolgreich gelöscht",
		});
	} catch (error: any) {
		console.error("[API] Error deleting time entry:", error);
		return NextResponse.json({ error: error.message || "Fehler beim Löschen des Zeiteintrags" }, { status: 500 });
	}
}
