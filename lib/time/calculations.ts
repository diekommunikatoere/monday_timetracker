/**
 * Get current time as HH:MM string
 */
export const getCurrentTimeString = (): string => {
	const now = new Date();
	return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
};

/**
 * Format a Date as a local HH:MM string
 */
export const formatTimeString = (date: Date): string => {
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/**
 * Add seconds to a HH:MM time string
 */
export const addSecondsToTimeString = (timeStr: string, seconds: number): string => {
	const [hours, minutes] = timeStr.split(":").map(Number);
	const totalMinutes = (hours || 0) * 60 + (minutes || 0) + Math.floor(seconds / 60);
	const newHours = Math.floor(totalMinutes / 60) % 24; // Wrap around at 24 hours
	const newMinutes = totalMinutes % 60;
	return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;
};

/**
 * Subtract seconds from a HH:MM time string
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
 * Calculate duration in seconds between two HH:MM time strings
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
 * Convert HH:MM to seconds
 */
export const durationToSeconds = (timeStr: string): number => {
	const [hours, minutes] = timeStr.split(":").map(Number);
	return (hours || 0) * 3600 + (minutes || 0) * 60;
};

/**
 * Convert seconds to HH:MM
 */
export const secondsToDuration = (seconds: number): string => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};
