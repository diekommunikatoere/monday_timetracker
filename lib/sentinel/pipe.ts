// lib/sentinel/pipe.ts
// The Pipe: a batch of pending sync targets in Redis. One open Pipe receives work; sealed Pipes
// wait to be (or are being) drained. An entry means "this item's columns must be recomputed from
// the DB", so duplicates collapse. Redis errors/timeouts propagate to the caller.

import { KEY_PREFIX, redisCall } from "./redis";

import type { PipeEntry, SyncTarget } from "./types";

const OPEN_KEY = `${KEY_PREFIX}pipe:open`;
const SEALED_PREFIX = `${KEY_PREFIX}pipe:sealed:`;

/**
 * Adds `target` to the open Pipe. A fresh event resets `attempts` to 0 (a target that keeps
 * getting events is therefore never dropped) and overwrites any earlier `reason`.
 */
export async function enqueue(target: SyncTarget, reason: string): Promise<void> {
	const entry: PipeEntry = { boardIdHint: target.boardIdHint, reason, queuedAt: Date.now(), attempts: 0 };
	await redisCall((c) => c.hset(OPEN_KEY, target.itemId, JSON.stringify(entry)));
}

/** Puts a failed entry back with `attempts + 1`, unless a fresh event already sits in the open Pipe. Retries wait for the next cycle. */
export async function requeue(itemId: string, entry: PipeEntry): Promise<void> {
	const next: PipeEntry = { ...entry, attempts: entry.attempts + 1 };
	await redisCall((c) => c.hsetnx(OPEN_KEY, itemId, JSON.stringify(next)));
}

export async function openSize(): Promise<number> {
	return redisCall((c) => c.hlen(OPEN_KEY));
}

/** Keys of all sealed Pipes (cursor-based `SCAN`, never `KEYS`). */
export async function sealedKeys(): Promise<string[]> {
	const keys = new Set<string>();
	let cursor = "0";
	do {
		const [next, batch] = await redisCall((c) => c.scan(cursor, "MATCH", `${SEALED_PREFIX}*`, "COUNT", 200));
		for (const key of batch) keys.add(key);
		cursor = next;
	} while (cursor !== "0");
	return [...keys];
}

/**
 * Atomically seals the open Pipe (`RENAME`); writers keep `HSET`-ing the fixed open key, so work
 * arriving afterwards lands in a fresh open Pipe. Returns the sealed key, or `null` if there was nothing to seal.
 */
export async function seal(): Promise<string | null> {
	const sealedKey = `${SEALED_PREFIX}${crypto.randomUUID()}`;
	try {
		await redisCall((c) => c.rename(OPEN_KEY, sealedKey));
		return sealedKey;
	} catch (error) {
		if (error instanceof Error && /no such key/i.test(error.message)) return null;
		throw error;
	}
}

/** Reads a sealed Pipe. Unparseable fields are logged and deleted; a vanished key yields `[]`. */
export async function read(sealedKey: string): Promise<Array<[itemId: string, entry: PipeEntry]>> {
	const fields = await redisCall((c) => c.hgetall(sealedKey));
	const entries: Array<[string, PipeEntry]> = [];
	const corrupt: string[] = [];

	for (const [itemId, raw] of Object.entries(fields)) {
		try {
			const parsed = JSON.parse(raw) as PipeEntry;
			if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
			entries.push([itemId, { boardIdHint: parsed.boardIdHint ?? null, reason: String(parsed.reason ?? "unknown"), queuedAt: Number(parsed.queuedAt) || 0, attempts: Number(parsed.attempts) || 0 }]);
		} catch (error) {
			console.error(`[Sentinel] Dropping unparseable Pipe entry ${itemId} in ${sealedKey}:`, error);
			corrupt.push(itemId);
		}
	}

	if (corrupt.length > 0) await ack(sealedKey, corrupt);
	return entries;
}

/** Removes processed entries from a sealed Pipe (Redis deletes the hash once it is empty). */
export async function ack(sealedKey: string, itemIds: string[]): Promise<void> {
	if (itemIds.length === 0) return;
	await redisCall((c) => c.hdel(sealedKey, ...itemIds));
}
