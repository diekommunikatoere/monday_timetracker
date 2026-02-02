// components/shared/hooks/useTimeEntryForm.ts
"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { getCurrentTimeString, addSecondsToTimeString, subtractSecondsFromTimeString, calculateDurationBetweenTimes, durationToSeconds, secondsToDuration } from "@/lib/utils";

export interface TimeEntryFormValues {
	date: Date;
	duration: string;
	startTime: string;
	endTime: string;
	comment: string;
}

export interface UseTimeEntryFormOptions {
	initialValues?: Partial<TimeEntryFormValues>;
	onValuesChange?: (values: TimeEntryFormValues) => void;
	isEnabled?: boolean;
	initialIsLocked?: boolean;
}

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
