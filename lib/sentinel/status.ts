// lib/sentinel/status.ts
// Best-effort status snapshot in Redis (`<prefix>status`, no TTL) for the admin tab.
// Reads and writes never throw.

import * as pipe from "./pipe";
import { KEY_PREFIX, redisCall } from "./redis";

import type { SentinelStatus } from "./types";

const STATUS_KEY = `${KEY_PREFIX}status`;

const EMPTY_STATUS: SentinelStatus = { lastCycleAt: null, lastCycleResult: null, lastDrain: null, lastError: null, lastErrorAt: null };

/** The stored status, or `null` when Redis can't be read. */
export async function readStatus(): Promise<SentinelStatus | null> {
	try {
		const raw = await redisCall((c) => c.get(STATUS_KEY));
		return raw ? { ...EMPTY_STATUS, ...(JSON.parse(raw) as Partial<SentinelStatus>) } : EMPTY_STATUS;
	} catch {
		return null;
	}
}

/** Merges `patch` into the stored status (read-modify-write; losing a race is harmless). */
export async function writeStatus(patch: Partial<SentinelStatus>): Promise<void> {
	try {
		const current = (await readStatus()) ?? EMPTY_STATUS;
		await redisCall((c) => c.set(STATUS_KEY, JSON.stringify({ ...current, ...patch })));
	} catch {
		// status is best-effort
	}
}

/** Status plus live Pipe counts; every field is `null` if Redis can't be reached. */
export async function getSentinelStatus(): Promise<{ status: SentinelStatus | null; openPipeSize: number | null; sealedPipeCount: number | null }> {
	const [status, openPipeSize, sealedPipeCount] = await Promise.all([
		readStatus(),
		pipe.openSize().catch(() => null),
		pipe
			.sealedKeys()
			.then((keys) => keys.length)
			.catch(() => null),
	]);
	return { status, openPipeSize, sealedPipeCount };
}
