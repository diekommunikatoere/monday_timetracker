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
 * Mutually-exclusive time anchor for the form.
 *
 * - `"none"` — free state: editing a time recomputes the duration; editing the
 *   duration moves the end time. Matches the historical "unlocked" behavior.
 * - `"start"` — the start time is the fixed reference; editing the duration
 *   pushes the end into the future.
 * - `"end"` — the end time is the fixed reference; editing the duration pushes
 *   the start into the past.
 *
 * `durationLocked` may only be `true` when the anchor is `"start"` or `"end"`.
 */
export type TimeAnchor = "none" | "start" | "end";

/**
 * Options accepted by {@link useTimeEntryForm}.
 *
 * @property initialValues         - Partial overrides for any {@link TimeEntryFormValues} field; omitted fields fall back to sensible defaults (`new Date()`, `"00:00"`, the current local time).
 * @property onValuesChange        - Optional listener fired whenever the composed `values` object changes; receives the full {@link TimeEntryFormValues}.
 * @property initialAnchor         - Initial {@link TimeAnchor}. Defaults to `"none"` (free).
 * @property initialDurationLocked - Whether the duration starts locked. Ignored (forced to `false`) when `initialAnchor === "none"`. Defaults to `false`.
 */
export interface UseTimeEntryFormOptions {
	initialValues?: Partial<TimeEntryFormValues>;
	onValuesChange?: (values: TimeEntryFormValues) => void;
	initialAnchor?: TimeAnchor;
	initialDurationLocked?: boolean;
}

/**
 * Controlled-state hook backing the time-entry edit form.
 *
 * Holds `date`, `duration`, `startTime`, `endTime`, and `comment` and keeps
 * them **mutually consistent** (`endTime = startTime + duration`, clamped at 0)
 * as the user edits any one of them. Consistency is driven by two pieces of
 * lock state:
 *
 * - A mutually-exclusive **anchor** ({@link TimeAnchor}) pins one boundary as
 *   the fixed reference. Editing the duration moves the *other* boundary
 *   (`"end"` → start moves into the past; `"start"`/`"none"` → end moves into
 *   the future). The anchored time field is rendered read-only by
 *   {@link TimeEntryFormFields}; its "now" button is the explicit escape hatch.
 * - **`durationLocked`** freezes the duration (only allowed when an anchor is
 *   set) so the start/end window slides as a unit: editing either time moves
 *   the other to keep the duration constant.
 *
 * Locks **pin the current value** — they do not advance it to "now". "Now" is
 * produced only by the open-time default the caller passes to {@link reset} and
 * by the per-field "now" buttons; there is no live tick.
 *
 * All arithmetic uses the helpers from `lib/time` (e.g.
 * `calculateDurationBetweenTimes`, `addSecondsToTimeString`), which work on
 * `"HH:MM"` strings and **seconds** and wrap around midnight — a multi-day
 * interval is therefore **not** representable here (max ~24h).
 *
 * A `useRef<"duration" | "times" | "reset" | null>` ("`updateSource`") guards
 * against feedback loops so internal state-machine updates don't double back
 * and overwrite the field the user is editing.
 *
 * Consumed by {@link TimeEntryFormFields}; cross-link it for the rendered UI.
 *
 * @param options - {@link UseTimeEntryFormOptions}; defaults to an empty object.
 * @returns An object with:
 *   - `values` — memoized {@link TimeEntryFormValues} snapshot (`date`, `duration`, `startTime`, `endTime`, `comment`);
 *   - `anchor` — the current {@link TimeAnchor};
 *   - `durationLocked` — whether the duration is frozen;
 *   - `handlers` — memoized action set: `setDate`, `setComment`,
 *     `handleStartTimeChange`, `handleEndTimeChange`, `handleDurationChange`
 *     (all accept `"HH:MM"` strings), `adjustDuration(minutes)` (adds/subtracts
 *     whole **minutes**, clamped at 0), `handleStartTimeNow` /
 *     `handleEndTimeNow` (snap to current local time), `toggleStartLock` /
 *     `toggleEndLock` / `toggleDurationLock`, and
 *     `reset(newValues, newAnchor?, newDurationLocked?)` which replaces the
 *     whole form and bypasses the sync effect for one cycle.
 */
export function useTimeEntryForm(options: UseTimeEntryFormOptions = {}) {
	const { initialAnchor = "none", initialDurationLocked = false } = options;
	const [date, setDate] = useState<Date>(options.initialValues?.date || new Date());
	const [duration, setDuration] = useState(options.initialValues?.duration || "00:00");
	const [startTime, setStartTime] = useState(options.initialValues?.startTime || getCurrentTimeString());
	const [endTime, setEndTime] = useState(options.initialValues?.endTime || getCurrentTimeString());
	const [comment, setComment] = useState(options.initialValues?.comment || "");
	const [anchor, setAnchor] = useState<TimeAnchor>(initialAnchor);
	const [durationLocked, setDurationLocked] = useState<boolean>(initialAnchor === "none" ? false : initialDurationLocked);

	const updateSource = useRef<"duration" | "times" | "reset" | null>(null);

	// Sync: when the duration changes (input or quick-adjust), move the boundary
	// opposite the anchor — end-anchored moves the start, start/none moves the end.
	// Editing a time field sets the "times" source so this effect skips that cycle.
	useEffect(() => {
		if (updateSource.current === "times" || updateSource.current === "reset") {
			if (updateSource.current !== "reset") updateSource.current = null;
			return;
		}

		const durationSeconds = durationToSeconds(duration);
		if (anchor === "end") {
			const newStartTime = subtractSecondsFromTimeString(endTime, durationSeconds);
			updateSource.current = "duration";
			setStartTime(newStartTime);
		} else {
			const newEndTime = addSecondsToTimeString(startTime, durationSeconds);
			updateSource.current = "duration";
			setEndTime(newEndTime);
		}
	}, [duration, anchor, endTime, startTime]);

	const handleStartTimeChange = useCallback(
		(val: string) => {
			updateSource.current = "times";
			setStartTime(val);
			if (durationLocked) {
				// Window slides: keep duration, move the end with the start.
				const durationSeconds = durationToSeconds(duration);
				setEndTime(addSecondsToTimeString(val, durationSeconds));
			} else {
				// Recompute the duration; the end stays put.
				const newDurationSeconds = calculateDurationBetweenTimes(val, endTime);
				setDuration(secondsToDuration(Math.max(0, newDurationSeconds)));
			}
		},
		[endTime, duration, durationLocked],
	);

	const handleEndTimeChange = useCallback(
		(val: string) => {
			updateSource.current = "times";
			setEndTime(val);
			if (durationLocked) {
				// Window slides: keep duration, move the start with the end.
				const durationSeconds = durationToSeconds(duration);
				setStartTime(subtractSecondsFromTimeString(val, durationSeconds));
			} else {
				// Recompute the duration; the start stays put.
				const newDurationSeconds = calculateDurationBetweenTimes(startTime, val);
				setDuration(secondsToDuration(Math.max(0, newDurationSeconds)));
			}
		},
		[startTime, duration, durationLocked],
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

	// "Now" buttons override the read-only anchor field without clearing the lock.
	// Functionally identical to a manual edit, which already preserves the anchor.
	const handleStartTimeNow = useCallback(() => {
		handleStartTimeChange(getCurrentTimeString());
	}, [handleStartTimeChange]);

	const handleEndTimeNow = useCallback(() => {
		handleEndTimeChange(getCurrentTimeString());
	}, [handleEndTimeChange]);

	const toggleStartLock = useCallback(() => {
		if (durationLocked) {
			return; // can't toggle anchor when duration is locked
		}
		setAnchor((prev) => (prev === "start" ? "none" : "start"));
	}, [durationLocked]);

	const toggleEndLock = useCallback(() => {
		if (durationLocked) {
			return; // can't toggle anchor when duration is locked
		}
		setAnchor((prev) => (prev === "end" ? "none" : "end"));
	}, [durationLocked]);

	const toggleDurationLock = useCallback(() => {
		anchor === "end" ? toggleEndLock() : anchor === "start" ? toggleStartLock() : null;
		setDurationLocked((prev) => !prev);
	}, [anchor, durationLocked]);

	const reset = useCallback((newValues: TimeEntryFormValues, newAnchor?: TimeAnchor, newDurationLocked?: boolean) => {
		updateSource.current = "reset";
		setDate(newValues.date);
		setDuration(newValues.duration);
		setStartTime(newValues.startTime);
		setEndTime(newValues.endTime);
		setComment(newValues.comment);
		if (newAnchor !== undefined) {
			setAnchor(newAnchor);
			// Duration-lock requires an anchor; clear it when resetting to free.
			setDurationLocked(newAnchor === "none" ? false : (newDurationLocked ?? false));
		} else if (newDurationLocked !== undefined) {
			setDurationLocked(newDurationLocked);
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
			toggleStartLock,
			toggleEndLock,
			toggleDurationLock,
			reset,
		}),
		[setDate, setComment, handleStartTimeChange, handleEndTimeChange, handleDurationChange, adjustDuration, handleStartTimeNow, handleEndTimeNow, toggleStartLock, toggleEndLock, toggleDurationLock, reset],
	);

	return {
		values,
		anchor,
		durationLocked,
		handlers: handlersObject,
	};
}
