import { SyncPurpose } from "@/types/database";

// Column types that are compatible with time tracking sync
export const COMPATIBLE_COLUMN_TYPES: Record<string, { label: string; purposes: SyncPurpose[] }> = {
	numbers: {
		label: "Numbers",
		purposes: ["total_time", "remaining_budget", "budget_used"],
	},
	text: {
		label: "Text",
		purposes: ["total_time", "time_by_role"],
	},
	long_text: {
		label: "Long Text",
		purposes: ["time_by_role"],
	},
	// Note: time_tracking column type is read-only in monday.com API
};

/**
 * Validates if a column type is compatible with a specific sync purpose
 */
export function isPurposeCompatible(columnType: string, purpose: SyncPurpose): boolean {
	const compatInfo = COMPATIBLE_COLUMN_TYPES[columnType];
	if (!compatInfo) return false;
	return compatInfo.purposes.includes(purpose);
}

/**
 * Checks if a sync purpose is time-based (requires time formatting)
 */
export function isTimePurpose(purpose: SyncPurpose): boolean {
	return purpose === "total_time" || purpose === "time_by_role";
}
