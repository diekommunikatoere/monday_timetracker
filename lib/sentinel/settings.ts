// lib/sentinel/settings.ts
// Admin-editable Sentinel settings (`app_settings` key "sentinel").

import { getSetting } from "@/lib/settings";

export interface SentinelSettings {
	/** Seconds between Valve cycles while work is pending. */
	intervalSeconds: number;
	/** `false` = work keeps collecting in the Pipe but is not drained. */
	valveOpen: boolean;
}

export const SENTINEL_SETTINGS_KEY = "sentinel";
export const SENTINEL_DEFAULTS: SentinelSettings = { intervalSeconds: 60, valveOpen: true };
export const MIN_INTERVAL_SECONDS = 15;
export const MAX_INTERVAL_SECONDS = 120;

/** Current settings (clamped to the allowed interval range) and whether they were read from the DB. */
export async function getSentinelSettings(): Promise<{ settings: SentinelSettings; persisted: boolean }> {
	const { value, persisted } = await getSetting<SentinelSettings>(SENTINEL_SETTINGS_KEY, SENTINEL_DEFAULTS);
	const interval = Number.isFinite(value.intervalSeconds) ? Math.round(value.intervalSeconds) : SENTINEL_DEFAULTS.intervalSeconds;
	return {
		settings: {
			intervalSeconds: Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, interval)),
			valveOpen: typeof value.valveOpen === "boolean" ? value.valveOpen : SENTINEL_DEFAULTS.valveOpen,
		},
		persisted,
	};
}

/**
 * Validates a PATCH body: a non-empty object with only `intervalSeconds` (integer 15–120)
 * and/or `valveOpen` (boolean). Returns the parsed patch, or an error message.
 */
export function parseSentinelSettingsPatch(body: unknown): { patch: Partial<SentinelSettings> } | { error: string } {
	if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Body must be an object" };

	const entries = Object.entries(body);
	if (entries.length === 0) return { error: "Body must not be empty" };

	const patch: Partial<SentinelSettings> = {};
	for (const [key, value] of entries) {
		if (key === "intervalSeconds") {
			if (typeof value !== "number" || !Number.isInteger(value) || value < MIN_INTERVAL_SECONDS || value > MAX_INTERVAL_SECONDS) {
				return { error: `intervalSeconds must be an integer between ${MIN_INTERVAL_SECONDS} and ${MAX_INTERVAL_SECONDS}` };
			}
			patch.intervalSeconds = value;
		} else if (key === "valveOpen") {
			if (typeof value !== "boolean") return { error: "valveOpen must be a boolean" };
			patch.valveOpen = value;
		} else {
			return { error: `Unknown setting: ${key}` };
		}
	}
	return { patch };
}
