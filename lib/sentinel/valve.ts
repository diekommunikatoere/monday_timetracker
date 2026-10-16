// lib/sentinel/valve.ts
// The Valve: controls flow. Seals the open Pipe on a timer and hands sealed Pipes to the Outlet.
//
// The Valve is armed by *work*, not a permanent loop, so an idle app can still sleep on Railway:
// `arm()` sets a one-shot timer, and after a cycle the Valve re-arms only while work remains.
// All runtime state lives on `globalThis.__sentinel` (see ./state.ts).

import { drain } from "./outlet";
import * as pipe from "./pipe";
import { acquireLock, releaseLock, renewLock } from "./redis";
import { getSentinelSettings } from "./settings";
import { getState } from "./state";
import { writeStatus } from "./status";

import type { CycleResult, DrainResult } from "./types";

const DRAIN_BUDGET_MS = 90_000;
const BOOT_DELAY_MS = 10_000;
const RETRY_STEP_MS = 15_000;

function logError(error: unknown) {
	console.error("[Sentinel] Valve error:", error);
}

/**
 * Arms the one-shot cycle timer. Synchronous. No-op if a timer is already pending or the Valve
 * is (last known) closed. Deliberately ignores `SENTINEL_DISABLED`: with the kill switch on,
 * `observe` never enqueues and so never arms — only boot recovery and the drain-remaining
 * re-arms do, and those must keep working so queued work is never stranded.
 */
export function arm(delayMs?: number): void {
	const state = getState();
	if (state.timer || state.settings.valveOpen === false) return;

	const handle = setTimeout(
		() => {
			if (state.timer === handle) state.timer = null;
			void cycle().catch(logError);
		},
		delayMs ?? state.settings.intervalSeconds * 1000,
	);
	state.timer = handle;
}

/** Replaces a pending timer with one at the current interval (used when the interval changes). */
export function rearm(): void {
	const state = getState();
	if (state.timer) {
		clearTimeout(state.timer);
		state.timer = null;
	}
	arm();
}

export function isRunning(): boolean {
	return getState().running;
}

/**
 * Runs one cycle: refresh settings → take the cross-process lock → seal the open Pipe → drain
 * every sealed Pipe (oldest leftovers and the new one alike) within a 90 s budget → status →
 * decide whether to re-arm. Never rejects.
 *
 * @param options.force - Run even when the Valve is closed (explicit admin action).
 */
export async function cycle({ force = false }: { force?: boolean } = {}): Promise<CycleResult> {
	const state = getState();
	if (state.running) return { ran: false, reason: "busy" };

	// A manual run must not orphan a pending timer.
	if (state.timer) {
		clearTimeout(state.timer);
		state.timer = null;
	}
	state.running = true;

	let result: CycleResult;
	let failed = false;
	let lockHeld = false;

	try {
		state.settings = (await getSentinelSettings()).settings;

		if (!state.settings.valveOpen && !force) {
			// Not re-armed: opening the Valve does that.
			result = { ran: false, reason: "closed" };
		} else {
			try {
				lockHeld = await acquireLock(state.instanceId);
			} catch {
				// The SET may have landed even though the call failed — don't leave a lock we can't see.
				await releaseLock(state.instanceId).catch(() => {});
			}

			if (!lockHeld) {
				result = { ran: false, reason: "locked" };
			} else {
				const deadline = Date.now() + DRAIN_BUDGET_MS;
				const sealed = await pipe.seal();
				const drains: DrainResult[] = [];

				for (const key of await pipe.sealedKeys()) {
					if (Date.now() > deadline) break;
					drains.push(await drain(key, { deadline, renewLock: () => renewLock(state.instanceId) }));
				}

				result = { ran: true, sealed, drains };
				state.retryCount = 0;
			}
		}
		state.lastCycleResult = result;

		const lastDrain = result.ran ? ([...result.drains].reverse().find((d) => d.total > 0) ?? null) : null;
		await writeStatus({ lastCycleAt: new Date().toISOString(), lastCycleResult: result, ...(lastDrain && { lastDrain }) });
	} catch (error) {
		logError(error);
		failed = true;
		state.retryCount++;
		result = { ran: true, sealed: null, drains: [] };
		await writeStatus({ lastCycleAt: new Date().toISOString(), lastError: error instanceof Error ? error.message : String(error), lastErrorAt: new Date().toISOString() });
	} finally {
		if (lockHeld) await releaseLock(state.instanceId).catch(logError);
		state.running = false;
	}

	try {
		if (failed) {
			// Back off 15 s, 30 s, 45 s (capped at the interval), then settle at the full interval.
			arm(state.retryCount <= 3 ? Math.min(state.settings.intervalSeconds * 1000, RETRY_STEP_MS * state.retryCount) : undefined);
		} else if (result.ran === false) {
			if (result.reason === "locked") arm();
		} else if ((await pipe.openSize()) > 0 || (await pipe.sealedKeys()).length > 0) {
			arm();
		}
		// Otherwise idle: the app may sleep; the next enqueue or boot recovers.
	} catch (error) {
		// Counts unknown (Redis trouble) — keep trying at the full interval.
		logError(error);
		arm();
	}

	return result;
}

/**
 * Called once per server instance from `register()` (also with `SENTINEL_DISABLED`, so leftovers
 * drain). Synchronous: schedules a boot-recovery cycle in 10 s — which picks up Pipes left by a
 * crash, deploy or sleep — and refreshes settings in the background. The boot cycle is not
 * forced, so a closed Valve stays closed until an admin opens it.
 */
export function start(): void {
	const state = getState();
	void getSentinelSettings()
		.then(({ settings }) => {
			state.settings = settings;
		})
		.catch(logError);
	arm(BOOT_DELAY_MS);
}
