// lib/sentinel/redis.ts
// Sentinel's own ioredis client (the shared client in lib/redis.ts is untouched) plus the
// helpers that keep a slow or dead Redis from stalling a webhook.
//
// Key namespace: `sentinel:<RAILWAY_ENVIRONMENT_NAME|local>:`
//   pipe:open            hash  itemId → PipeEntry JSON (the one open Pipe)
//   pipe:sealed:<uuid>   hash  sealed Pipes waiting to be / being drained
//   valve:lock           string  cross-process cycle lock (value = instanceId)
//   status               string  best-effort status JSON for the admin tab
// Renaming the Railway environment strands keys under the old prefix.

import Redis from "ioredis";

import { getState } from "./state";

/** Per-call latency bound. The race below — not ioredis' retry settings — enforces it. */
export const REDIS_TIMEOUT_MS = 2000;

export const KEY_PREFIX = `sentinel:${process.env.RAILWAY_ENVIRONMENT_NAME ?? "local"}:`;

export class SentinelTimeoutError extends Error {
	constructor(ms: number) {
		super(`Sentinel Redis call timed out after ${ms} ms`);
		this.name = "SentinelTimeoutError";
	}
}

/**
 * Returns the dedicated client, creating it on first use (eager connect). The offline queue stays
 * on so commands issued while the connection is still being (re-)established after a wake are
 * queued instead of rejected; `maxRetriesPerRequest: 1` + a 2 s `connectTimeout` keep failures quick.
 */
export function getRedis(): Redis {
	const state = getState();
	if (state.redis) return state.redis;

	const client = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
	// Without a listener ioredis logs "Unhandled error event"; never rethrow from here.
	client.on("error", (error) => console.error("[Sentinel] Redis error:", error.message));

	state.redis = client;
	return client;
}

/**
 * Races `promise` against a timeout. The underlying promise gets a no-op `catch` first, so if it
 * rejects after the timeout it does not surface as an unhandled rejection.
 *
 * @throws {SentinelTimeoutError} when `ms` elapses first.
 */
export function withTimeout<T>(promise: Promise<T>, ms = REDIS_TIMEOUT_MS): Promise<T> {
	promise.catch(() => {});
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new SentinelTimeoutError(ms)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

/** Runs one Redis command on the Sentinel client under {@link withTimeout}. */
export function redisCall<T>(command: (client: Redis) => Promise<T>): Promise<T> {
	try {
		return withTimeout(command(getRedis()));
	} catch (error) {
		return Promise.reject(error);
	}
}

const COMPARE_AND_DELETE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
const COMPARE_AND_EXPIRE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;

export const LOCK_KEY = `${KEY_PREFIX}valve:lock`;
export const LOCK_TTL_MS = 120_000;

/** `SET lock instanceId NX PX ttl`. Returns whether this process now holds the lock. */
export async function acquireLock(instanceId: string): Promise<boolean> {
	return (await redisCall((c) => c.set(LOCK_KEY, instanceId, "PX", LOCK_TTL_MS, "NX"))) === "OK";
}

/** Extends the lock's TTL iff this process still owns it. */
export async function renewLock(instanceId: string): Promise<boolean> {
	return Number(await redisCall((c) => c.eval(COMPARE_AND_EXPIRE, 1, LOCK_KEY, instanceId, String(LOCK_TTL_MS)))) === 1;
}

/** Deletes the lock iff this process still owns it. */
export async function releaseLock(instanceId: string): Promise<void> {
	await redisCall((c) => c.eval(COMPARE_AND_DELETE, 1, LOCK_KEY, instanceId));
}
