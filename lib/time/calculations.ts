// lib/time/calculations.ts
// Client-side time utilities for converting between HH:MM wall-clock strings,
// seconds, and calendar dates. All times are in the user's local timezone —
// there is no server-side timezone conversion in this app.

/**
 * Returns the current local wall-clock time as an `"HH:MM"` string.
 *
 * Uses `Date` from the browser/Node environment, so the result is in the
 * **user's local timezone**. Seconds are truncated (not rounded).
 *
 * @returns A zero-padded 24-hour time string, e.g. `"09:05"` or `"23:47"`.
 */
export const getCurrentTimeString = (): string => {
	const now = new Date();
	return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

/**
 * Formats a `Date` as a local `"HH:MM"` string using the environment's
 * local timezone (identical logic to {@link getCurrentTimeString} but accepts
 * an arbitrary date).
 *
 * Seconds are truncated. Use {@link secondsToDuration} when you need a
 * duration rather than a wall-clock moment.
 *
 * @param date - Any `Date` instance; its local hours and minutes are used.
 * @returns Zero-padded 24-hour time string, e.g. `"14:30"`.
 */
export const formatTimeString = (date: Date): string => {
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/**
 * Adds a duration (in seconds) to a `"HH:MM"` wall-clock string and returns
 * the resulting time as a new `"HH:MM"` string.
 *
 * The result wraps around midnight modulo 24 hours — adding 2 hours to
 * `"23:00"` yields `"01:00"`, not `"25:00"`. Sub-minute seconds are
 * **truncated**, not rounded (only whole minutes are added).
 *
 * @param timeStr - Base time in `"HH:MM"` format (24-hour, local).
 * @param seconds - Duration to add, in **seconds** (e.g. `3600` for 1 hour).
 * @returns Resulting time in `"HH:MM"` format, wrapping at 24 hours.
 */
export const addSecondsToTimeString = (timeStr: string, seconds: number): string => {
	const [hours, minutes] = timeStr.split(":").map(Number);
	const totalMinutes = (hours || 0) * 60 + (minutes || 0) + Math.floor(seconds / 60);
	const newHours = Math.floor(totalMinutes / 60) % 24; // Wrap around at 24 hours
	const newMinutes = totalMinutes % 60;
	return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
};

/**
 * Subtracts a duration (in seconds) from a `"HH:MM"` wall-clock string and
 * returns the resulting time as a new `"HH:MM"` string.
 *
 * The result wraps backwards through midnight — subtracting 2 hours from
 * `"01:00"` yields `"23:00"`. Sub-minute seconds are **truncated** (only
 * whole minutes are subtracted).
 *
 * @param timeStr - Base time in `"HH:MM"` format (24-hour, local).
 * @param seconds - Duration to subtract, in **seconds**.
 * @returns Resulting time in `"HH:MM"` format, wrapping at 00:00.
 */
export const subtractSecondsFromTimeString = (timeStr: string, seconds: number): string => {
	const [hours, minutes] = timeStr.split(":").map(Number);
	let totalMinutes = (hours || 0) * 60 + (minutes || 0) - Math.floor(seconds / 60);
	if (totalMinutes < 0) {
		totalMinutes += 24 * 60; // Wrap around for previous day
	}
	const newHours = Math.floor(totalMinutes / 60) % 24;
	const newMinutes = totalMinutes % 60;
	return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
};

/**
 * Calculates the elapsed duration between two `"HH:MM"` wall-clock strings
 * and returns it in **seconds**.
 *
 * If `endTime` is numerically earlier than `startTime` (i.e. the interval
 * crosses midnight), a full 24-hour wrap is assumed — the result will be the
 * duration from `startTime` to `endTime` on the **next** calendar day. This
 * means the maximum return value is just under 24 hours (86 340 s).
 *
 * @param startTime - Entry start time in `"HH:MM"` format.
 * @param endTime   - Entry end time in `"HH:MM"` format.
 * @returns Elapsed duration in **seconds** (always ≥ 0).
 */
export const calculateDurationBetweenTimes = (startTime: string, endTime: string): number => {
	const [startHours, startMinutes] = startTime.split(":").map(Number);
	const [endHours, endMinutes] = endTime.split(":").map(Number);

	const startTotalMinutes = (startHours || 0) * 60 + (startMinutes || 0);
	let endTotalMinutes = (endHours || 0) * 60 + (endMinutes || 0);

	// Handle case where end time is before start time (next day)
	if (endTotalMinutes < startTotalMinutes) {
		endTotalMinutes += 24 * 60; // Add 24 hours
	}

	return (endTotalMinutes - startTotalMinutes) * 60; // Return seconds
};

/**
 * Parses a duration string in `"HH:MM"` format and converts it to **seconds**.
 *
 * Treats the input as a duration (not a wall-clock time), so values above
 * `"23:59"` are valid — `"48:30"` → 174 600 s. Missing or non-numeric
 * components default to `0` via `|| 0`.
 *
 * @param timeStr - Duration string in `"HH:MM"` format.
 * @returns Total duration in **seconds**.
 */
export const durationToSeconds = (timeStr: string): number => {
	const [hours, minutes] = timeStr.split(":").map(Number);
	return (hours || 0) * 3600 + (minutes || 0) * 60;
};

/**
 * Converts a duration in **seconds** to a zero-padded `"HH:MM"` string.
 *
 * Hours are not capped — `90000` s → `"25:00"`. Use this for duration
 * display (time-entry fields) rather than wall-clock display; for wall-clock
 * strings use {@link formatTimeString} or {@link getCurrentTimeString}.
 *
 * Inverse of {@link durationToSeconds}.
 *
 * @param seconds - Duration in **seconds** (non-negative integer expected).
 * @returns Duration string in `"HH:MM"` format.
 */
export const secondsToDuration = (seconds: number): string => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
