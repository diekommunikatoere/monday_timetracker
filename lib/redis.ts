// lib/redis.ts
// Redis client (ioredis) and cache helper used by the server-side data layer.
//
// Key namespaces:
//   `time_entry:<id>`  — individual time-entry rows, 300 s TTL.
//   `time_entry:all`   — full result set from getAllTimeEntries, 300 s TTL.
//   `hard_delete:<id>` — deferred hard-delete queue drained by the cleanup cron.
//
// After any write to the `time_entry` table, callers must call
// `cacheHelper.clearPattern("time_entry:*")` to evict stale reads.
// All cache errors are swallowed and logged so a Redis outage never breaks
// the primary data path.

import Redis from "ioredis";

/**
 * Singleton ioredis client, connected via `REDIS_URL`.
 *
 * Connection errors are logged but not thrown — the app tolerates a Redis
 * outage by falling through to the database. Import {@link cacheHelper}
 * instead of this client for normal cache operations; use the raw client
 * only when you need direct Redis commands (e.g. `EXPIRE`, `TTL`).
 */
const redis = new Redis(process.env.REDIS_URL);

redis.on("error", (error) => {
	console.error("Redis connection error:", error);
});

redis.on("connect", () => {
	console.log("✅ Redis connected");
});

export default redis;

/**
 * Thin, error-tolerant wrapper around the {@link redis} client.
 *
 * Every method catches and logs errors internally, returning a safe fallback
 * (`null`, `[]`, or `void`) so a Redis outage never surfaces to callers as an
 * exception. Values are serialised with `JSON.stringify` / `JSON.parse`, so
 * they must be JSON-serialisable.
 *
 * Typical usage pattern in the data layer:
 * ```ts
 * const cached = await cacheHelper.get<TimeEntry[]>("time_entry:all");
 * if (cached) return cached;
 * // …fetch from DB…
 * await cacheHelper.set("time_entry:all", data, 300);
 * ```
 */
export const cacheHelper = {
	/**
	 * Retrieve a cached value by key.
	 *
	 * Returns `null` on cache miss **or** on any Redis error.
	 *
	 * @typeParam T   - Expected shape of the cached value.
	 * @param key     - Exact Redis key to look up.
	 * @returns The deserialised value, or `null` if absent or on error.
	 */
	async get<T>(key: string): Promise<T | null> {
		try {
			const data = await redis.get(key);
			return data ? JSON.parse(data) : null;
		} catch (error) {
			console.error(`Cache get error for key ${key}:`, error);
			return null;
		}
	},

	/**
	 * Store a value under `key` with a TTL.
	 *
	 * Uses `SETEX` so the key is automatically evicted after `ttl` seconds.
	 * Errors are logged and swallowed — a failed cache write is non-fatal.
	 *
	 * @param key   - Redis key to write.
	 * @param value - JSON-serialisable value to store.
	 * @param ttl   - Time-to-live in **seconds** (default: 3600 = 1 hour).
	 */
	async set(key: string, value: any, ttl: number = 3600): Promise<void> {
		try {
			await redis.setex(key, ttl, JSON.stringify(value));
		} catch (error) {
			console.error(`Cache set error for key ${key}:`, error);
		}
	},

	/**
	 * Delete a single key from the cache.
	 *
	 * Call this after writing to an individual record (e.g. `time_entry:<id>`)
	 * in addition to {@link clearPattern} for the wildcard sweep.
	 *
	 * @param key - Exact Redis key to delete.
	 */
	async del(key: string): Promise<void> {
		try {
			await redis.del(key);
		} catch (error) {
			console.error(`Cache delete error for key ${key}:`, error);
		}
	},

	/**
	 * Delete all keys matching a glob pattern.
	 *
	 * Uses `KEYS` (not `SCAN`) — suitable for the current data volume but
	 * **avoid** on very large key-spaces where `KEYS` can block the server.
	 * After any `time_entry` write, call `clearPattern("time_entry:*")` to
	 * evict both per-entry and aggregate cache entries.
	 *
	 * @param pattern - Glob-style pattern (e.g. `"time_entry:*"`).
	 */
	async clearPattern(pattern: string): Promise<void> {
		try {
			const keys = await redis.keys(pattern);
			if (keys.length > 0) {
				await redis.del(...keys);
			}
		} catch (error) {
			console.error(`Cache clear pattern error for ${pattern}:`, error);
		}
	},

	/**
	 * Return all Redis keys matching a glob pattern.
	 *
	 * Useful for inspecting the `hard_delete:*` deferred-work queue before
	 * draining it. Returns `[]` on error.
	 *
	 * @param pattern - Glob-style pattern (e.g. `"hard_delete:*"`).
	 * @returns Array of matching key strings, or `[]` on error.
	 */
	async keys(pattern: string): Promise<string[]> {
		try {
			return await redis.keys(pattern);
		} catch (error) {
			console.error(`Cache keys error for ${pattern}:`, error);
			return [];
		}
	},
};
