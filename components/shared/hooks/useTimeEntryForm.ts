// components/shared/hooks/useTimeEntryForm.ts
"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
}

export function useTimeEntryForm(options: UseTimeEntryFormOptions = {}) {
	const [date, setDate] = useState<Date>(options.initialValues?.date || new Date());
	const [duration, setDuration] = useState(options.initialValues?.duration || "00:00");
	const [startTime, setStartTime] = useState(options.initialValues?.startTime || getCurrentTimeString());
	const [endTime, setEndTime] = useState(options.initialValues?.endTime || getCurrentTimeString());
	const [comment, setComment] = useState(options.initialValues?.comment || "");
	const [isLocked, setIsLocked] = useState(true);

	const updateSource = useRef<"duration" | "times" | "lock" | null>(null);

	// Sync logic
	useEffect(() => {
		if (updateSource.current === "duration") {
			const seconds = durationToSeconds(duration);
			setEndTime(addSecondsToTimeString(startTime, seconds));
		} else if (updateSource.current === "times") {
			const seconds = calculateDurationBetweenTimes(startTime, endTime);
			setDuration(secondsToDuration(Math.max(0, seconds)));
		}
		updateSource.current = null;
	}, [duration, startTime, endTime]);

	const handleStartTimeChange = useCallback(
		(val: string) => {
			updateSource.current = "times";
			setStartTime(val);
			if (isLocked) setIsLocked(false);
		},
		[isLocked],
	);

	const handleEndTimeChange = useCallback(
		(val: string) => {
			updateSource.current = "times";
			setEndTime(val);
			if (isLocked) setIsLocked(false);
		},
		[isLocked],
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

	return {
		values: { date, duration, startTime, endTime, comment },
		isLocked,
		handlers: {
			setDate,
			setComment,
			handleStartTimeChange,
			handleEndTimeChange,
			handleDurationChange,
			adjustDuration,
			handleStartTimeNow,
			handleEndTimeNow,
			toggleLock,
		},
	};
}
