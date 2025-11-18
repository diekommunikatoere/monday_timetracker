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
 *
 * - only create segments when timer is running
 * - when pausing, close current segment and don't create a new segment
 * - when resuming, create a new running segment
 * - reset logic stays the same
 * - add duration column to timer_segment table
 * - save duration when closing a segment to the segment record
 * - when calculating elapsed time, sum up durations from segments
 *
 *  */
