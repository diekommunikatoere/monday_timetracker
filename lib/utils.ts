/**
 * Format milliseconds into a human-readable duration string
 * @param milliseconds - Duration in milliseconds
 * @returns Human-readable duration string (e.g., "2 hours, 30 minutes")
 */
export function formatDuration(milliseconds: number): string {
	const seconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	const remainingMinutes = minutes % 60;
	const remainingSeconds = seconds % 60;

	const parts = [];

	if (hours > 0) {
		parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
	}

	if (remainingMinutes > 0) {
		parts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`);
	}

	if (remainingSeconds > 0 && hours === 0 && remainingMinutes === 0) {
		parts.push(`${remainingSeconds} second${remainingSeconds !== 1 ? "s" : ""}`);
	}

	return parts.join(", ") || "0 seconds";
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
 * Format milliseconds to a simple time string (HH:MM:SS)
 * @param milliseconds - Duration in milliseconds
 * @returns Time string in HH:MM:SS format
 */
export function formatTime(milliseconds: number): string {
	const seconds = Math.floor(milliseconds / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	const formattedHours = hours.toString().padStart(2, "0");
	const formattedMinutes = (minutes % 60).toString().padStart(2, "0");
	const formattedSeconds = (seconds % 60).toString().padStart(2, "0");

	return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}
