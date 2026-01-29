/**
 * Format seconds into a human-readable duration string
 * @param seconds - Duration in seconds (canonical DB/app unit)
 * @returns Human-readable duration string (e.g., "2 h 30 m")
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
 * Format ISO timestamp to human-readable date and time
 * @param isoString - ISO timestamp string
 * @returns Human-readable date and time string
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
 * Format seconds to a simple time string (HH:MM:SS)
 * @param seconds - Duration in seconds
 * @returns Time string in HH:MM:SS format
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
 * Round duration in seconds according to business rules:
 * - 0 seconds remains 0 seconds
 * - 1-59 seconds rounds up to 60 seconds (1 minute)
 * - 60 seconds or more remains unchanged
 * @param seconds - Duration in seconds
 * @returns Rounded duration in seconds
 */
export function roundDuration(seconds: number): number {
	if (seconds > 0 && seconds < 60) {
		return 60;
	}
	return seconds;
}

/**
 * Combines a Date object and a HH:MM time string into a UTC ISO string,
 * treating the time string as being in the user's local timezone.
 * @param date - The Date object representing the day
 * @param timeStr - The time string in "HH:MM" format (local time)
 * @returns UTC ISO string
 */
export function combineDateAndTime(date: Date, timeStr: string): string {
	const [hours, minutes] = timeStr.split(":").map(Number);
	const combined = new Date(date);
	combined.setHours(hours, minutes, 0, 0);
	return combined.toISOString();
}
