// lib/settings.ts
// Generic key/value app settings backed by the `app_settings` table (service-role only).
//
// Reads are cached in-process for 10 s (every outcome, including failures) so hot paths
// like the Sentinel Valve can consult them each cycle without a DB round-trip. The cache is
// per module graph: route handlers and `instrumentation.ts` are separate bundles, so a write
// made through one is seen by the other up to 10 s late.

import { supabaseAdmin } from "@/lib/supabase/server";

import type { Json } from "@/types/database";

const CACHE_TTL_MS = 10_000;

interface CacheEntry {
	value: unknown;
	persisted: boolean;
	expiresAt: number;
}

/** Cached outcome of the latest read per key (successful or not). */
const cache = new Map<string, CacheEntry>();

/** Last value that was actually read from the DB — survives a DB blip so it never reverts to defaults. */
const lastKnown = new Map<string, unknown>();

/**
 * Reads setting `key`, shallow-merged over `defaults`.
 *
 * `persisted` is `false` when the value could not be read (DB error): the result is then the
 * last successfully read value if there is one — a DB blip must not reopen a closed Valve —
 * otherwise `defaults`. A missing row also yields `defaults`, but with `persisted: true`.
 * The outcome (success or failure) is cached for 10 s; failures are logged once per window.
 *
 * @typeParam T   - Shape of the setting's JSON object.
 * @param key     - `app_settings.key`.
 * @param defaults - Values for fields the stored object lacks.
 */
export async function getSetting<T extends object>(key: string, defaults: T): Promise<{ value: T; persisted: boolean }> {
	const cached = cache.get(key);
	if (cached && cached.expiresAt > Date.now()) return { value: cached.value as T, persisted: cached.persisted };

	let outcome: { value: T; persisted: boolean };
	try {
		const { data, error } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
		if (error) throw error;

		const stored = data?.value && typeof data.value === "object" && !Array.isArray(data.value) ? (data.value as Partial<T>) : {};
		const value = { ...defaults, ...stored };
		lastKnown.set(key, value);
		outcome = { value, persisted: true };
	} catch (error) {
		console.error(`[settings] Failed to read "${key}":`, error);
		outcome = { value: (lastKnown.get(key) as T | undefined) ?? defaults, persisted: false };
	}

	cache.set(key, { ...outcome, expiresAt: Date.now() + CACHE_TTL_MS });
	return outcome;
}

/**
 * Upserts setting `key` and clears its cache entry.
 *
 * @param key     - `app_settings.key`.
 * @param value   - Full JSON object to store (replaces the row's value).
 * @param actorId - `user_profiles.id` of the writer, or `null` when unknown.
 * @throws When the DB write fails (callers map this to a 500).
 */
export async function setSetting<T extends object>(key: string, value: T, actorId: string | null): Promise<void> {
	const { error } = await supabaseAdmin.from("app_settings").upsert({ key, value: value as unknown as Json, updated_by: actorId, updated_at: new Date().toISOString() });
	if (error) throw error;

	lastKnown.set(key, value);
	cache.delete(key);
}
