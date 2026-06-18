// components/shared/hooks/useTimeEntryForm.ts
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { getCurrentTimeString, addSecondsToTimeString, subtractSecondsFromTimeString, calculateDurationBetweenTimes, durationToSeconds, secondsToDuration } from "@/lib/utils";

/**
 * The editable values for a single time-entry form.
 *
 * Note the unit convention: `date`, `startTime`, `endTime`, and `duration` are
 * all in the **form's local timezone** and formatted as `"HH:MM"` wall-clock /
 * duration strings (not ISO timestamps and not seconds). The DB column
 * `time_entry.duration` is in **seconds**, so the conversion happens outside
 * this hook — see `durationToSeconds` / `secondsToDuration` in `lib/time`.
 * {@link TimeEntryFormFields} renders these fields.
 *
 * @property date      - Calendar day the entry belongs to (form-level `Date`).
 * @property duration  - Tracked duration as an `"HH:MM"` string; hours may exceed 23 (e.g. `"25:30"`).
 * @property startTime - Entry start time as an `"HH:MM"` 24-hour local-time string.
 * @property endTime   - Entry end time as an `"HH:MM"` 24-hour local-time string.
 * @property comment   - Optional free-text note; empty string when none.
 */
export interface TimeEntryFormValues {
	date: Date;
	duration: string;
	startTime: string;
	endTime: string;
	comment: string;
}

/**
 * Options accepted by {@link useTimeEntryForm}.
 *
 * @property initialValues    - Partial overrides for any {@link TimeEntryFormValues} field; omitted fields fall back to sensible defaults (`new Date()`, `"00:00"`, the current local time).
 * @property onValuesChange    - Optional listener fired whenever the composed `values` object changes; receives the full {@link TimeEntryFormValues}.
 * @property isEnabled         - Master kill-switch; when `false`, the live end-time auto-tick effect is disabled. Defaults to `true`.
 * @property initialIsLocked   - Whether the end time starts in live-tracking mode (see `isLocked` on the hook's return). Defaults to `true`.
 */
export interface UseTimeEntryFormOptions {
	initialValues?: Partial<TimeEntryFormValues>;
	onValuesChange?: (values: TimeEntryFormValues) => void;
	isEnabled?: boolean;
	initialIsLocked?: boolean;
}

/**
 * Controlled-state hook backing the time-entry edit form.
 *
 * Holds `date`, `duration`, `startTime`, `endTime`, and `comment` and keeps
 * them **mutually consistent** as the user edits any one of them:
 *
 * - When **locked** (the default), `endTime` ticks forward automatically every
 *   10 seconds to the current local time, and `duration` is held constant
 *   while `startTime` is shifted backwards to match. This emulates a live
 *   running timer.
 * - When **unlocked**, editing `duration` recomputes `endTime` from
 *   `startTime + duration`; editing either time recomputes `duration`.
 * - Any manual edit of a time field **unlocks** the end time (live tracking
 *   stops) so the user's explicit value wins.
 *
 * All arithmetic uses the helpers from `lib/time` (e.g.
 * `calculateDurationBetweenTimes`, `addSecondsToTimeString`), which work on
 * `"HH:MM"` strings and **seconds** and wrap around midnight — a multi-day
 * interval is therefore **not** representable here (max ~24h).
 *
 * A `useRef<"duration" | "times" | "lock" | "reset" | null>` ("`updateSource`")
 * guards against feedback loops so internal state-machine updates don't double
 * back and overwrite the field the user is editing.
 *
 * Consumed by {@link TimeEntryFormFields}; cross-link it for the rendered UI.
 *
 * @param options - {@link UseTimeEntryFormOptions}; defaults to an empty object.
 * @returns An object with:
 *   - `values` — memoized {@link TimeEntryFormValues} snapshot (`date`, `duration`, `startTime`, `endTime`, `comment`);
 *   - `isLocked` — boolean, whether `endTime` is live-tracking now;
 *   - `handlers` — memoized action set: `setDate`, `setComment`,
 *     `handleStartTimeChange`, `handleEndTimeChange`, `handleDurationChange`
 *     (all accept `"HH:MM"` strings), `adjustDuration(minutes)` (adds/subtracts
 *     whole **minutes**, clamped at 0), `handleStartTimeNow` /
 *     `handleEndTimeNow` (snap to current local time), `toggleLock`, and
 *     `reset(newValues, newIsLocked?)` which replaces the whole form and
 *     bypasses the sync effects for one cycle.
 */
export function useTimeEntryForm(options: UseTimeEntryFormOptions = {}) {
	const { isEnabled = true, initialIsLocked = true } = options;
	const [date, setDate] = useState<Date>(options.initialValues?.date || new Date());
	const [duration, setDuration] = useState(options.initialValues?.duration || "00:00");
	const [startTime, setStartTime] = useState(options.initialValues?.startTime || getCurrentTimeString());
	const [endTime, setEndTime] = useState(options.initialValues?.endTime || getCurrentTimeString());
	const [comment, setComment] = useState(options.initialValues?.comment || "");
	const [isLocked, setIsLocked] = useState(initialIsLocked);

	const updateSource = useRef<"duration" | "times" | "lock" | "reset" | null>(null);

	// Live update for locked end time
	useEffect(() => {
		if (!isLocked || !isEnabled) return;

		const interval = setInterval(() => {
			const currentTime = getCurrentTimeString();
			if (currentTime !== endTime) {
				updateSource.current = "lock";
				setEndTime(currentTime);
				// When end time updates automatically, we need to update start time based on duration
				const durationSeconds = durationToSeconds(duration);
				setStartTime(subtractSecondsFromTimeString(currentTime, durationSeconds));
			}
		}, 10000); // Check every 10 seconds

		return () => clearInterval(interval);
	}, [isLocked, endTime, duration, isEnabled]);

	// Sync: When duration changes (from input or buttons), update start_time (if locked) or end_time (if unlocked)
	useEffect(() => {
		if (updateSource.current === "times" || updateSource.current === "lock" || updateSource.current === "reset") {
			if (updateSource.current !== "reset") updateSource.current = null;
			return;
		}

		const durationSeconds = durationToSeconds(duration);
		if (isLocked) {
			const newStartTime = subtractSecondsFromTimeString(endTime, durationSeconds);
			updateSource.current = "duration";
			setStartTime(newStartTime);
		} else {
			const newEndTime = addSecondsToTimeString(startTime, durationSeconds);
			updateSource.current = "duration";
			setEndTime(newEndTime);
		}
	}, [duration, isLocked, endTime, startTime]);

	const handleStartTimeChange = useCallback(
		(val: string) => {
			setStartTime(val);
			updateSource.current = "times";
			const newDurationSeconds = calculateDurationBetweenTimes(val, endTime);
			setDuration(secondsToDuration(Math.max(0, newDurationSeconds)));
			// Manual edit unlocks the end time
			if (isLocked) setIsLocked(false);
		},
		[endTime, isLocked],
	);

	const handleEndTimeChange = useCallback(
		(val: string) => {
			setEndTime(val);
			updateSource.current = "times";
			const newDurationSeconds = calculateDurationBetweenTimes(startTime, val);
			setDuration(secondsToDuration(Math.max(0, newDurationSeconds)));
			// Manual edit unlocks the end time
			if (isLocked) setIsLocked(false);
		},
		[startTime, isLocked],
	);

	const handleDurationChange = useCallback((val: string) => {
		updateSource.current = "duration";
		setDuration(val);
	}, []);

	const adjustDuration = useCallback(
		(minutes: number) => {
			updateSource.current = "duration";
			const currentSeconds = durationToSeconds(duration);
			const newSeconds = Math.max(0, currentSeconds + minutes * 60);
			setDuration(secondsToDuration(newSeconds));
		},
		[duration],
	);

	const handleStartTimeNow = useCallback(() => {
		handleStartTimeChange(getCurrentTimeString());
	}, [handleStartTimeChange]);

	const handleEndTimeNow = useCallback(() => {
		handleEndTimeChange(getCurrentTimeString());
	}, [handleEndTimeChange]);

	const toggleLock = useCallback(() => {
		setIsLocked(!isLocked);
	}, [isLocked]);

	const reset = useCallback((newValues: TimeEntryFormValues, newIsLocked?: boolean) => {
		updateSource.current = "reset";
		setDate(newValues.date);
		setDuration(newValues.duration);
		setStartTime(newValues.startTime);
		setEndTime(newValues.endTime);
		setComment(newValues.comment);
		if (newIsLocked !== undefined) {
			setIsLocked(newIsLocked);
		}
		// Clear the reset flag after a short delay to allow effects to skip
		setTimeout(() => {
			if (updateSource.current === "reset") {
				updateSource.current = null;
			}
		}, 0);
	}, []);

	const values = useMemo(
		() => ({
			date,
			duration,
			startTime,
			endTime,
			comment,
		}),
		[date, duration, startTime, endTime, comment],
	);

	const handlersObject = useMemo(
		() => ({
			setDate,
			setComment,
			handleStartTimeChange,
			handleEndTimeChange,
			handleDurationChange,
			adjustDuration,
			handleStartTimeNow,
			handleEndTimeNow,
			toggleLock,
			reset,
		}),
		[setDate, setComment, handleStartTimeChange, handleEndTimeChange, handleDurationChange, adjustDuration, handleStartTimeNow, handleEndTimeNow, toggleLock, reset],
	);

	return {
		values,
		isLocked,
		handlers: handlersObject,
	};
}
