import { NextRequest, NextResponse } from "next/server";

import { clearBudgetBoardItemsCache, getItemDetails } from "@/lib/monday";
import { cacheHelper } from "@/lib/redis";
import { sentinel } from "@/lib/sentinel";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Clears the Abrechnung monday-layer cache ({@link clearBudgetBoardItemsCache}) for a
 * board a create/update/delete webhook just fired on. Cheap and safe to call
 * unconditionally — clearing a non-budget board's (nonexistent) cache entries is a no-op,
 * and this avoids an extra `board_config` lookup per webhook just to check first.
 */
async function invalidateBudgetItemsCache(boardId: string | null | undefined): Promise<void> {
	if (!boardId) return;
	await clearBudgetBoardItemsCache(boardId);
}

/**
 * Re-points the time entries of moved items to their new board, so column sync and the
 * board_role_override rate join (both keyed on time_entry.board_id) follow the item.
 * Only rows whose board actually changes are touched, and those get updated_by = NULL so
 * the audit trigger logs the change as a system action instead of crediting the row's
 * last human editor. Returns the number of re-pointed entries.
 */
async function repointTimeEntriesToBoard(itemIds: string[], boardId: string): Promise<number> {
	const { data, error } = await supabaseAdmin.from("time_entry").update({ board_id: boardId, updated_by: null, updated_at: new Date().toISOString() }).in("item_id", itemIds).or(`board_id.is.null,board_id.neq.${boardId}`).select("id");

	if (error) {
		console.error(`[webhook] Failed to re-point time entries of items ${itemIds.join(", ")} to board ${boardId}:`, error);
		return 0;
	}

	if (data.length > 0) await cacheHelper.clearPattern("time_entry:*");
	return data.length;
}

/**
 * Resolves the parent item's board_id and group_id using:
 * 1. Event payload fields
 * 2. DB lookup on monday_item
 * 3. Monday API fallback (also upserts parent to DB)
 */
async function resolveParentInfo(parentItemId: string, eventData?: { parentItemBoardId?: string; boardId?: string }): Promise<{ boardId: string | null; groupId: string | null }> {
	// 1. Try event payload
	if (eventData?.parentItemBoardId) {
		// We have the board from the event, but still need group — try DB
		const { data: dbItem } = await supabaseAdmin.from("monday_item").select("board_id, group_id").eq("id", parentItemId).single();

		if (dbItem?.group_id) {
			return { boardId: eventData.parentItemBoardId, groupId: dbItem.group_id };
		}
	}

	// 2. Try DB lookup
	const { data: dbItem } = await supabaseAdmin.from("monday_item").select("board_id, group_id").eq("id", parentItemId).single();

	if (dbItem?.board_id && dbItem?.group_id) {
		return { boardId: dbItem.board_id, groupId: dbItem.group_id };
	}

	// 3. API fallback — also upsert parent into DB for future lookups
	const parentDetails = await getItemDetails(parentItemId);
	if (parentDetails) {
		await supabaseAdmin.from("monday_item").upsert({
			id: parentDetails.id,
			board_id: parentDetails.boardId,
			group_id: parentDetails.groupId,
			name: parentDetails.name || "Unnamed Item",
			is_active: true,
			updated_at: new Date().toISOString(),
		});
		return { boardId: parentDetails.boardId, groupId: parentDetails.groupId };
	}

	return { boardId: null, groupId: null };
}

/**
 * POST /api/webhooks/monday
 * Single endpoint for all monday.com webhook events.
 */
export async function POST(request: NextRequest) {
	try {
		// TEMP DEBUG — remove after confirming Monday's auth header shape
		console.log("[webhook] headers:", JSON.stringify(Object.fromEntries(request.headers)));

		const body = await request.json();

		// 1. Handle monday.com verification challenge
		if (body.challenge) {
			return NextResponse.json(body);
		}

		// 2. Parse event data
		const { event } = body;
		if (!event) {
			return NextResponse.json({ error: "No event data found" }, { status: 400 });
		}

		const eventType = event.type;

		console.log(`Received monday webhook: ${eventType} for board ${event.boardId || event.sourceBoardId}, item ${event.itemId || event.pulseId || event.subitem}`);
		console.log("Full event data:", JSON.stringify(event));

		// 3. Handle different event types
		switch (eventType) {
			case "create_pulse": {
				const { groupId, pulseName } = event;
				const itemId = (event.pulseId || event.itemId).toString();

				// Query API to detect if subitem (monday sends create_pulse for both)
				const itemDetails = await getItemDetails(itemId);
				const parentItemId = itemDetails?.parentItemId || null;

				let effectiveBoardId: string | null;
				let effectiveGroupId: string | null | undefined;

				if (parentItemId) {
					// Subitem: resolve parent's board_id and group_id
					const parentInfo = await resolveParentInfo(parentItemId, event);
					effectiveBoardId = parentInfo.boardId || itemDetails?.parentBoardId || event.boardId;
					effectiveGroupId = parentInfo.groupId || itemDetails?.parentGroupId;
				} else {
					// Regular item: use event data directly
					effectiveBoardId = event.boardId || itemDetails?.boardId;
					effectiveGroupId = groupId?.toString();
				}

				await supabaseAdmin.from("monday_item").upsert({
					id: itemId,
					board_id: effectiveBoardId,
					group_id: effectiveGroupId,
					parent_item_id: parentItemId,
					name: pulseName || itemDetails?.name || "Unnamed Item",
					is_active: true,
					updated_at: new Date().toISOString(),
				});

				// A new budget item (or a new job item, whose board isn't this one) doesn't
				// matter to the cache either way — invalidating a non-budget board's cache
				// is a no-op, so this stays unconditional rather than checking board_config first.
				await invalidateBudgetItemsCache(effectiveBoardId);
				break;
			}

			case "update_name": {
				const { value } = event;
				await supabaseAdmin
					.from("monday_item")
					.update({
						name: value?.name || "Unnamed Item",
						updated_at: new Date().toISOString(),
					})
					.eq("id", event.pulseId?.toString());

				await invalidateBudgetItemsCache(event.boardId?.toString());
				break;
			}

			case "move_pulse_into_group": {
				const { destGroupId } = event;
				const movedItemId = event.pulseId?.toString();
				const newGroupId = destGroupId?.toString();

				// Update the parent item's group
				await supabaseAdmin
					.from("monday_item")
					.update({
						group_id: newGroupId,
						updated_at: new Date().toISOString(),
					})
					.eq("id", movedItemId);

				// Cascade group_id to all subitems of this parent
				await supabaseAdmin
					.from("monday_item")
					.update({
						group_id: newGroupId,
						updated_at: new Date().toISOString(),
					})
					.eq("parent_item_id", movedItemId);
				break;
			}

			case "move_pulse_into_board": {
				// Fires when an item moves to another (tracked) board, and also when a
				// subitem is converted to an item. board_id and group_id both change;
				// clearing parent_item_id handles the subitem->item conversion case.
				const movedItemId = event.pulseId?.toString();
				const newBoardId = event.boardId?.toString();
				const newGroupId = event.destGroupId?.toString();
				const now = new Date().toISOString();

				// Old board/parent, read before the update: needed for cache invalidation and
				// for re-syncing a former parent when a subitem was converted to an item.
				const { data: previousRow } = await supabaseAdmin.from("monday_item").select("board_id, parent_item_id").eq("id", movedItemId).maybeSingle();

				await supabaseAdmin
					.from("monday_item")
					.update({
						board_id: newBoardId,
						group_id: newGroupId,
						parent_item_id: null,
						updated_at: now,
					})
					.eq("id", movedItemId);

				// Subitems follow their parent to the new board and group.
				const { data: movedSubitems } = await supabaseAdmin
					.from("monday_item")
					.update({
						board_id: newBoardId,
						group_id: newGroupId,
						updated_at: now,
					})
					.eq("parent_item_id", movedItemId)
					.select("id");

				// Subitem entries carry their parent's board, so they move along too.
				const repointedCount = await repointTimeEntriesToBoard([movedItemId, ...(movedSubitems ?? []).map((s) => s.id)], newBoardId);

				// Column syncs are handed to Sentinel: the moved item if its entries followed it, and —
				// for a subitem -> item conversion — the former parent, which lost this item's time.
				await sentinel.observe({
					type: "item.moved_board",
					itemId: movedItemId,
					toBoardId: newBoardId,
					entriesRepointed: repointedCount,
					formerParent: previousRow?.parent_item_id && previousRow.board_id ? { parentId: previousRow.parent_item_id, boardId: previousRow.board_id } : null,
				});

				await invalidateBudgetItemsCache(previousRow?.board_id);
				if (previousRow?.board_id !== newBoardId) await invalidateBudgetItemsCache(newBoardId);
				break;
			}

			case "delete_pulse": {
				// Soft-delete: Monday keeps trashed items restorable for 30 days, and a
				// hard delete would orphan time entries (item_id ON DELETE SET NULL).
				// Item-delete payloads carry itemId; subitem-delete payloads carry both.
				const deletedItemId = (event.itemId || event.pulseId)?.toString();
				const trashedAt = new Date().toISOString();

				// Board id for the cache invalidation below — the event payload doesn't
				// reliably carry one for this event type, so read it before the row is
				// (still non-destructively) updated.
				const { data: deletedItemRow } = await supabaseAdmin.from("monday_item").select("board_id, parent_item_id").eq("id", deletedItemId).maybeSingle();

				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						deleted_at: trashedAt,
						updated_at: trashedAt,
					})
					.eq("id", deletedItemId);

				// Monday sends no events for a deleted item's subitems, so cascade the
				// trash to them. Only touch ones not already trashed.
				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						deleted_at: trashedAt,
						updated_at: trashedAt,
					})
					.eq("parent_item_id", deletedItemId)
					.is("deleted_at", null);

				// The parent's budget columns must be re-pushed now that this item's time is excluded.
				// A trashed top-level item is gone from monday, so Sentinel has nothing to do for it.
				await sentinel.observe({ type: "item.trashed", itemId: deletedItemId, parentId: deletedItemRow?.parent_item_id ?? null, boardId: deletedItemRow?.board_id ?? null });
				await invalidateBudgetItemsCache(event.boardId?.toString() || deletedItemRow?.board_id);
				break;
			}

			case "archive_pulse": {
				const archivedItemId = (event.itemId || event.pulseId)?.toString();

				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						updated_at: new Date().toISOString(),
					})
					.eq("id", archivedItemId);

				// Archiving a parent archives its subitems too, with no separate events.
				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: false,
						updated_at: new Date().toISOString(),
					})
					.eq("parent_item_id", archivedItemId);
				break;
			}

			case "restore_pulse": {
				// Clears both archive and trash state. Monday emits a separate
				// restore_pulse per item/subitem, so we don't cascade here.
				const restoredItemId = (event.itemId || event.pulseId)?.toString();

				await supabaseAdmin
					.from("monday_item")
					.update({
						is_active: true,
						deleted_at: null,
						updated_at: new Date().toISOString(),
					})
					.eq("id", restoredItemId);

				// Re-push budget now that this item's time counts again (parent for a
				// subitem; the item itself for a restored top-level item). parent_item_id and
				// board_id are untouched by the update above.
				const { data: restoredItemRow } = await supabaseAdmin.from("monday_item").select("parent_item_id, board_id").eq("id", restoredItemId).maybeSingle();
				await sentinel.observe({ type: "item.restored", itemId: restoredItemId, parentId: restoredItemRow?.parent_item_id ?? null, boardId: restoredItemRow?.board_id ?? null });
				break;
			}

			case "move_subitem": {
				// Subitems inherit group_id from their parent
				const newParentItemId = event.destPulseId?.toString() || null;
				const newParentDetails = await getItemDetails(newParentItemId);
				const newGroupId = newParentDetails?.groupId || null;
				const movedSubitemId = event.subitem?.toString();

				// Old parent/board, read before the update: the former parent has to be
				// re-synced because it just lost this subitem's time.
				const { data: previousRow } = await supabaseAdmin.from("monday_item").select("board_id, parent_item_id").eq("id", movedSubitemId).maybeSingle();

				// A subitem's stored board is its parent's board, so it can change with the parent.
				const newBoardId = newParentDetails?.boardId || previousRow?.board_id || null;

				await supabaseAdmin
					.from("monday_item")
					.update({
						parent_item_id: newParentItemId,
						group_id: newGroupId,
						...(newBoardId && { board_id: newBoardId }),
						updated_at: new Date().toISOString(),
					})
					.eq("id", movedSubitemId);

				if (movedSubitemId && newBoardId) await repointTimeEntriesToBoard([movedSubitemId], newBoardId);

				// Both parents' totals changed (Sentinel skips this when the parent is unchanged).
				await sentinel.observe({
					type: "subitem.reparented",
					subitemId: movedSubitemId,
					from: previousRow?.parent_item_id && previousRow.board_id ? { parentId: previousRow.parent_item_id, boardId: previousRow.board_id } : null,
					to: newParentItemId && newBoardId ? { parentId: newParentItemId, boardId: newBoardId } : null,
				});

				await invalidateBudgetItemsCache(previousRow?.board_id);
				if (previousRow?.board_id !== newBoardId) await invalidateBudgetItemsCache(newBoardId);
				break;
			}

			default:
				console.log(`Unhandled webhook event type: ${eventType}`);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Error in monday webhook handler:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
