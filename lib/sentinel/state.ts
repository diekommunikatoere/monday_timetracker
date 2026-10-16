// lib/sentinel/state.ts
// Process-wide Sentinel runtime state.
//
// Next.js loads `instrumentation.ts` as a separate bundle from route handlers, so module-level
// variables are NOT shared between them. Everything mutable lives on one `globalThis` object,
// and every accessor goes through {@link getState} — never assume `register()` created it.

import { randomUUID } from "node:crypto";

import { SENTINEL_DEFAULTS, type SentinelSettings } from "./settings";

import type { CycleResult } from "./types";
import type Redis from "ioredis";

export interface SentinelState {
	/** Identifies this process in the cross-process Valve lock. */
	instanceId: string;
	/** Pending one-shot Valve timer, if any. */
	timer: ReturnType<typeof setTimeout> | null;
	/** Re-entry guard: a cycle is in progress in this process. */
	running: boolean;
	/** Last known settings (refreshed at the start of every cycle and by the admin PATCH). */
	settings: SentinelSettings;
	/** Dedicated ioredis client, created lazily. */
	redis: Redis | null;
	/** Consecutive failed cycles. */
	retryCount: number;
	/** Result of the most recent cycle in this process (mirrored to Redis status). */
	lastCycleResult: CycleResult | null;
}

declare global {
	var __sentinel: SentinelState | undefined;
}

export function getState(): SentinelState {
	globalThis.__sentinel ??= {
		instanceId: randomUUID(),
		timer: null,
		running: false,
		settings: SENTINEL_DEFAULTS,
		redis: null,
		retryCount: 0,
		lastCycleResult: null,
	};
	return globalThis.__sentinel;
}
