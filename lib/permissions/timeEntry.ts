import { TimeEntry } from "@/types/time-entry";

export interface TimeEntryPermissions {
	canView: boolean; // Always true for item entries
	canCreate: boolean; // True for authenticated users
	canEdit: boolean; // True only for entry owner
	canDelete: boolean; // True only for entry owner
	canBulkSelect: boolean; // True only for own entries
}

/**
 * Check permissions for a specific time entry
 * @param entry The time entry to check
 * @param currentUserId The ID of the currently logged in user
 */
export function getTimeEntryPermissions(entry: TimeEntry, currentUserId: string | undefined): TimeEntryPermissions {
	const isOwner = currentUserId && entry.user_id === currentUserId;

	return {
		canView: true,
		canCreate: !!currentUserId,
		canEdit: !!isOwner,
		canDelete: !!isOwner,
		canBulkSelect: !!isOwner,
	};
}
