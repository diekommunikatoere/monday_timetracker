// components/shared/hooks/useTimeEntryPermissions.ts
"use client";

import { PERMISSIONS } from "@/lib/permissions/keys";
import { getTimeEntryPermissions, TimeEntryPermissions } from "@/lib/permissions/timeEntry";
import { TimeEntry } from "@/types/time-entry";

import { useHasPermission } from "./useHasPermission";

/**
 * Props for {@link useTimeEntryPermissions}.
 *
 * There is **no separate auth mechanism** in this app — identity comes from the
 * monday.com context (per `.kilocode/rules/authentication.md`). The id passed
 * here is the internal Supabase `user_profiles.id`, not the monday user id.
 *
 * @property entry         - The {@link TimeEntry} being permissioned; only `entry.user_id` is read.
 * @property currentUserId - Supabase `user_profiles.id` of the authenticated user, or `undefined` for the unauthenticated / lowest-privilege case.
 */
export interface UseTimeEntryPermissionsOptions {
	entry: TimeEntry;
	currentUserId: string | undefined;
}

/**
 * Thin React wrapper around {@link getTimeEntryPermissions} from
 * `lib/permissions/timeEntry`.
 *
 * Derives the fine-grained permission flags (`canView`, `canCreate`,
 * `canEdit`, `canDelete`, `canBulkSelect`) for a single {@link TimeEntry}
 * against the currently logged-in user. Edit/delete are granted to the entry
 * owner (`entry.user_id === currentUserId`) **and** to users holding
 * `time_entries.manage_others` (monday admins implicitly, via
 * {@link useHasPermission}); bulk-select stays owner-only. These flags only drive
 * the UI — the API routes re-check independently. Reads the current user id from
 * {@link useUserStore} at the call site (e.g. `TimeEntryRowMenu`).
 *
 * @param options - {@link UseTimeEntryPermissionsOptions}; `entry` and `currentUserId`.
 * @returns A {@link TimeEntryPermissions} object; never `null` (every flag is always defined).
 */
export function useTimeEntryPermissions(options: UseTimeEntryPermissionsOptions): TimeEntryPermissions {
	const { entry, currentUserId } = options;
	const canManageOthers = useHasPermission(PERMISSIONS.MANAGE_OTHERS_ENTRIES);
	return getTimeEntryPermissions(entry, currentUserId, canManageOthers);
}
