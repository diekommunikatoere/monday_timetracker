// lib/sentinel/outlet.ts
// The Outlet: processes a sealed Pipe. Each target is resolved against the *current* DB state
// (up to one interval has passed since it was queued), synced via `syncItemColumns`, and
// requeued on failure.

import { syncItemColumns } from "@/lib/columnSync";
import { supabaseAdmin } from "@/lib/supabase/server";

import * as pipe from "./pipe";

import type { DrainResult, PipeEntry } from "./types";

const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 5;

type Outcome = "succeeded" | "skipped" | "requeued" | "dropped";

/**
 * Decides which board to sync `itemId` on. A live `monday_item` row wins (it reflects moves that
 * happened since the target was queued); a trashed row means skip; with no row the hint is used.
 * Returns `null` when the item should be skipped. Throws on a Supabase error.
 */
export async function resolveBoard(itemId: string, boardIdHint: string | null): Promise<string | null> {
	const { data, error } = await supabaseAdmin.from("monday_item").select("board_id, deleted_at").eq("id", itemId).maybeSingle();
	if (error) throw error;

	if (data) return data.deleted_at ? null : (data.board_id ?? boardIdHint);
	return boardIdHint;
}

/**
 * Drains one sealed Pipe in batches of {@link BATCH_SIZE}.
 *
 * Resolving and syncing an entry run inside one try/catch: any failure (even a Supabase error
 * while resolving) is treated like a failed sync, so one bad entry can never make `drain` throw
 * before its ack (no poison Pipe). After each batch the processed ids are acked (after any
 * requeue — an entry whose requeue itself failed stays in the sealed Pipe) and the lock is
 * renewed; if renewal fails another process may own the lock, so draining stops. Entries not
 * reached by `deadline` stay in the sealed Pipe.
 *
 * @param sealedKey - Redis key of the sealed Pipe.
 * @param options.deadline  - Epoch ms after which no new batch is started.
 * @param options.renewLock - Extends the cross-process lock; resolves `false` if it was lost.
 * @throws On Redis failure (read/ack) — the caller treats the cycle as failed.
 */
export async function drain(sealedKey: string, options: { deadline: number; renewLock: () => Promise<boolean> }): Promise<DrainResult> {
	const startedAt = Date.now();
	const entries = await pipe.read(sealedKey);
	const counts: Record<Outcome, number> = { succeeded: 0, skipped: 0, requeued: 0, dropped: 0 };
	let processed = 0;

	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		if (Date.now() > options.deadline) break;

		const batch = entries.slice(i, i + BATCH_SIZE);
		const outcomes = await Promise.all(batch.map(([itemId, entry]) => processEntry(itemId, entry)));

		const ackIds: string[] = [];
		outcomes.forEach((outcome, index) => {
			if (outcome === null) return; // requeue failed — keep it in the sealed Pipe
			counts[outcome]++;
			ackIds.push(batch[index][0]);
		});

		await pipe.ack(sealedKey, ackIds);
		processed += batch.length;

		let lockOk = false;
		try {
			lockOk = await options.renewLock();
		} catch (error) {
			console.error("[Sentinel] Failed to renew the Valve lock:", error);
		}
		if (!lockOk) break;
	}

	return { pipe: sealedKey, total: entries.length, ...counts, remaining: entries.length - processed, durationMs: Date.now() - startedAt };
}

/** Handles one entry; resolves `null` when a failed entry could not even be requeued. */
async function processEntry(itemId: string, entry: PipeEntry): Promise<Outcome | null> {
	try {
		const boardId = await resolveBoard(itemId, entry.boardIdHint);
		if (!boardId) return "skipped";

		const result = await syncItemColumns(itemId, boardId, `sentinel:${entry.reason}`);
		if (result.overallSuccess) return "succeeded";
		console.warn(`[Sentinel] Sync of item ${itemId} did not fully succeed (attempt ${entry.attempts + 1}/${MAX_ATTEMPTS})`);
	} catch (error) {
		console.error(`[Sentinel] Sync of item ${itemId} failed (attempt ${entry.attempts + 1}/${MAX_ATTEMPTS}):`, error);
	}

	if (entry.attempts + 1 >= MAX_ATTEMPTS) {
		console.error(`[Sentinel] dropping item ${itemId} (${entry.reason}) after ${MAX_ATTEMPTS} attempts`);
		return "dropped";
	}

	try {
		await pipe.requeue(itemId, entry);
		return "requeued";
	} catch (error) {
		console.error(`[Sentinel] Failed to requeue item ${itemId}:`, error);
		return null;
	}
}
