import { NextRequest, NextResponse } from "next/server";
import { updateTimeEntry, softDeleteTimeEntry, getTimeEntryById } from "@/lib/database";
import { syncAfterUpdate, syncAfterDelete } from "@/lib/columnSync";
import { verifyMondayJwt } from "@/lib/monday-auth";
import { getUserProfileByMondayId } from "@/lib/database/users";

/**
 * `PATCH /api/time-entries/[id]` — update one time entry's editable fields.
 *
 * Auth is the monday session JWT (`Authorization: Bearer …`); the monday user id
 * is resolved to an internal `user_profiles.id` via {@link getUserProfileByMondayId},
 * and ownership + optimistic locking are enforced downstream in
 * {@link updateTimeEntry} (which whitelists the mutable columns — see
 * `SELF_EDITABLE_TIME_ENTRY_FIELDS`). The request body is `{ expectedUpdatedAt,
 * ...updates }`: `expectedUpdatedAt` is the caller's last-seen `updated_at` for the
 * concurrency check; the rest are the field updates.
 *
 * **`board_id`/`item_id`/`role_id` are required only when the entry is `finalized`.**
 * A `parked` (draft) entry is commonly edited via the reduced draft form
 * ({@link EditDraftEntryModal}), which sends only time fields + comment and leaves an
 * unassigned task/role as-is. The entry's `timer_state` is looked up **server-side**
 * ({@link getTimeEntryById}) rather than trusted from the request — a client-declared
 * flag or the mere shape of the payload could otherwise be used to skip the
 * requirement on an actually-finalized entry.
 *
 * On success, a column-sync write-back ({@link syncAfterUpdate}) is queued **only**
 * when the old or new state is `finalized` — a parked→parked edit can't move monday
 * totals (the aggregation RPCs count `finalized` rows only), so the sync is skipped.
 *
 * @param request - The incoming request; carries the `Authorization` header and JSON body.
 * @param params  - Route params resolving to `{ id }`, the `time_entry` UUID to update.
 * @returns `200` `{ success, data }` with the updated row; `400` on a finalized edit
 *   missing task/role; `401` unauthenticated; `404` unknown user or entry; `409` on an
 *   optimistic-lock conflict; `500` otherwise.
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

		// Look up timer_state server-side rather than trusting the request — see the
		// PATCH doc: board/item/role are required only for finalized entries, and that
		// gate must not be bypassable by a client-shaped payload or claimed flag.
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
