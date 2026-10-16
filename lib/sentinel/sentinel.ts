// lib/sentinel/sentinel.ts
// Sentinel: decides. Receives observations, matches them against the rule registry and queues
// the resulting sync targets into the Pipe. It never syncs on its own — except as the inline
// fallback that keeps behaviour no worse than before when the Pipe is unavailable.

import { syncItemColumns } from "@/lib/columnSync";

import { resolveBoard } from "./outlet";
import * as pipe from "./pipe";
import { evaluate } from "./rules";
import * as valve from "./valve";

import type { Observation, SyncTarget } from "./types";

/** Whether the kill switch is on: intake always syncs inline and never enqueues. */
export function isSentinelDisabled(): boolean {
	return process.env.SENTINEL_DISABLED === "1";
}

async function syncInline(target: SyncTarget, source: string): Promise<void> {
	try {
		const boardId = await resolveBoard(target.itemId, target.boardIdHint);
		if (!boardId) return;
		await syncItemColumns(target.itemId, boardId, source);
	} catch (error) {
		console.error(`[Sentinel] Inline sync of item ${target.itemId} failed:`, error);
	}
}

/**
 * Hands a structural monday event to Sentinel. Never throws.
 *
 * Each target is enqueued; if that fails or times out (Redis down) it is synced inline instead.
 * A timed-out `HSET` may still land later, at worst causing one extra sync. With
 * `SENTINEL_DISABLED=1` every target is synced inline and nothing is enqueued.
 */
export async function observe(observation: Observation): Promise<void> {
	try {
		const targets = evaluate(observation);
		if (targets.length === 0) return;

		const source = `webhook:${observation.type}`;
		if (isSentinelDisabled()) {
			await Promise.all(targets.map((t) => syncInline(t, source)));
			return;
		}

		let enqueued = false;
		await Promise.all(
			targets.map(async (t) => {
				try {
					await pipe.enqueue(t, observation.type);
					enqueued = true;
				} catch (error) {
					console.warn(`[Sentinel] fallback to inline sync for item ${t.itemId}:`, error instanceof Error ? error.message : error);
					await syncInline(t, source);
				}
			}),
		);

		if (enqueued) valve.arm();
	} catch (error) {
		console.error("[Sentinel] observe failed:", error);
	}
}
