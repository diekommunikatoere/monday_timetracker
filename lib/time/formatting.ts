// lib/time/formatting.ts
// Display-layer time formatting helpers.
//
// UNIT TRAP: formatTime() accepts MILLISECONDS; every other function in this
// file and in lib/time/calculations.ts accepts SECONDS. Check the unit before
// passing timer-store values.

/**
 * Converts a duration in **seconds** to a compact human-readable string with
 * the largest non-zero unit shown first.
 *
 * Formatting rules (derived from the implementation):
 * - Shows hours if `hours > 0`, e.g. `"2 h"`.
 * - Shows minutes if `remainingMinutes > 0`, e.g. `"30 m"`.
 * - Shows seconds **only** when both hours and minutes are zero, e.g. `"45 s"`.
 * - Returns `"0 s"` for zero or negative input.
 *
 * Examples: `3600` → `"1 h"`, `3661` → `"1 h 1 m"`, `45` → `"45 s"`, `0` → `"0 s"`.
 *
 * Note: seconds are omitted once there are whole minutes, so `61` → `"1 m"`, not `"1 m 1 s"`.
 *
 * @param seconds - Duration in **seconds** (canonical DB/timer unit). Must be a
 *                  non-negative integer; fractional seconds are truncated.
 * @returns Human-readable duration string, e.g. `"2 h 30 m"`.
 */
export function formatDuration(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	const remainingMinutes = minutes % 60;
	const remainingSeconds = seconds % 60;

	const parts: string[] = [];

	if (hours > 0) {
		parts.push(`${hours} h`);
	}

	if (remainingMinutes > 0) {
		parts.push(`${remainingMinutes} m`);
	}

	if (remainingSeconds > 0 && hours === 0 && remainingMinutes === 0) {
		parts.push(`${remainingSeconds} s`);
	}

	return parts.join(" ") || "0 s";
}

/**
 * Formats an ISO 8601 timestamp string into a localized date-and-time string
 * using the **German (`de-DE`) locale** with a short month abbreviation.
 *
 * Output format: `"17. Jun. 2026, 14:30"` (day. ShortMonth. Year, HH:MM).
 *
 * The locale is hard-coded to `de-DE` — this is intentional and not a bug.
 * Conversion happens in the **user's browser timezone** (via `toLocaleString`
 * default behaviour), which matches the app's no-server-side-timezone policy.
 *
 * @param isoString - An ISO 8601 timestamp string (e.g. a value from
 *                    `time_entry.created_at` or `time_entry.start_time`).
 * @returns Localized date-and-time string in `de-DE` format.
 */
export function formatTimestamp(isoString: string): string {
	const date = new Date(isoString);
	return date.toLocaleString("de-DE", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Formats a live-timer value as a zero-padded `"HH:MM:SS"` countdown/countup
 * string, suitable for the running-timer display in the dashboard widget.
 *
 * **IMPORTANT — the parameter is in MILLISECONDS, not seconds.** Despite the
 * parameter name `seconds`, the implementation divides by 1 000 before any
 * arithmetic. Pass raw timer-store elapsed values (which are in milliseconds
 * from the Supabase `timer_session.elapsed_time` column). Passing a value
 * already in seconds will produce a result 1 000× too small.
 *
 * Hours are not capped — a timer running for more than 24 hours will display
 * `"25:00:00"`, not wrap around.
 *
 * @param seconds - Elapsed time in **milliseconds** (parameter name is misleading).
 * @returns Zero-padded duration string in `"HH:MM:SS"` format, e.g. `"01:23:45"`.
 */
export function formatTime(seconds: number): string {
	const convertedSeconds = seconds / 1000;
	const hours = Math.floor(convertedSeconds / 3600);
	const minutes = Math.floor((convertedSeconds % 3600) / 60);
	const remainingSeconds = Math.floor(convertedSeconds % 60);

	const formattedHours = hours.toString().padStart(2, "0");
	const formattedMinutes = minutes.toString().padStart(2, "0");
	const formattedSeconds = remainingSeconds.toString().padStart(2, "0");

	return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}

/**
 * Applies the minimum-billing-unit rule to a duration: any non-zero duration
 * shorter than one minute is bumped up to exactly 60 seconds.
 *
 * Business rules (from the implementation):
 * - `0` → `0` (zero stays zero — no billable time).
 * - `1`–`59` → `60` (rounds **up** to 1 minute; never rounds down).
 * - `≥ 60` → unchanged.
 *
 * This is applied before writing a finalized `time_entry.duration` so that
 * very short accidental timer taps don't produce sub-minute entries. Call
 * before any column-sync write-back.
 *
 * @param seconds - Finalized entry duration in **seconds**.
 * @returns Duration in **seconds**, never between 1 and 59 inclusive.
 */
export function roundDuration(seconds: number): number {
	if (seconds > 0 && seconds < 60) {
		return 60;
	}
	return seconds;
}

/**
 * Merges a calendar `Date` (used for its year/month/day) with a local-time
 * `"HH:MM"` string to produce a **UTC ISO 8601 string** suitable for storing
 * in `time_entry.start_time` / `time_entry.end_time`.
 *
 * The `"HH:MM"` value is interpreted as **local time** (via `Date.setHours`),
 * so the UTC offset applied is the browser's current timezone offset — which
 * is correct for this app's no-server-side-timezone policy. Seconds and
 * milliseconds are zeroed out.
 *
 * Use this whenever converting a manual-entry form's date picker + time
 * picker into a DB-ready timestamp.
 *
 * @param date    - A `Date` whose year, month, and day components are used.
 *                  Time-of-day components on this object are **overwritten**.
 * @param timeStr - Local wall-clock time in `"HH:MM"` format (24-hour).
 * @returns UTC ISO 8601 string, e.g. `"2026-06-17T12:30:00.000Z"`.
 */
export function combineDateAndTime(date: Date, timeStr: string): string {
	const [hours, minutes] = timeStr.split(":").map(Number);
	const combined = new Date(date);
	combined.setHours(hours, minutes, 0, 0);
	return combined.toISOString();
}
