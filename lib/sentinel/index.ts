// lib/sentinel/index.ts
// Sentinel barrel. See the "Sentinel" section in the root CLAUDE.md.

import { observe, isSentinelDisabled } from "./sentinel";
import { arm, cycle, isRunning, rearm, start } from "./valve";

export { getSentinelStatus } from "./status";
export { getState as getSentinelState } from "./state";
export { getSentinelSettings, parseSentinelSettingsPatch, SENTINEL_DEFAULTS, SENTINEL_SETTINGS_KEY } from "./settings";
export type { SentinelSettings } from "./settings";
export type { CycleResult, DrainResult, Observation, SentinelStatus } from "./types";

/** Decides: observations in, queued sync targets out. */
export const sentinel = { observe, isDisabled: isSentinelDisabled };

/** Controls flow: arms/runs cycles that drain sealed Pipes. */
export const valve = { start, arm, rearm, cycle, isRunning };
