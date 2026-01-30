// components/shared/hooks/useTimeEntryPermissions.ts
"use client";

import { getTimeEntryPermissions, TimeEntryPermissions } from "@/lib/permissions/timeEntry";
import { TimeEntry } from "@/types/time-entry";

export interface UseTimeEntryPermissionsOptions {
	entry: TimeEntry;
	currentUserId: string | undefined;
}

export function useTimeEntryPermissions(options: UseTimeEntryPermissionsOptions): TimeEntryPermissions {
	const { entry, currentUserId } = options;
	return getTimeEntryPermissions(entry, currentUserId);
}
