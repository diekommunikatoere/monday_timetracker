// lib/utils.ts — Barrel re-export for lib/time/ and lib/permissions/.
// Import time utilities (formatDuration, formatTime, etc.) and permission helpers
// (getTimeEntryPermissions) from here rather than from the sub-modules directly.
export * from "./time";
export * from "./permissions";

// Keep any general utilities here if they don't fit elsewhere
// For now, we've moved the main ones to lib/time/
