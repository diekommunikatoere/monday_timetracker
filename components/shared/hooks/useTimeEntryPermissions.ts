// components/shared/hooks/useTimeEntryPermissions.ts
"use client";

import { getTimeEntryPermissions, TimeEntryPermissions } from "@/lib/permissions/timeEntry";
import { TimeEntry } from "@/types/time-entry";

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
 * against the currently logged-in user. The permission model is **pure
 * ownership**: edit/delete/bulk-select are granted **only** when
 * `entry.user_id === currentUserId`. There is no admin-role elevation in this
 * hook — admin gates live at the API route layer via `session.isAdmin` from
 * `verifyMondayJwt`. Reads the current user id from {@link useUserStore} at the
 * call site (e.g. `TimeEntryRowMenu`).
 *
 * @param options - {@link UseTimeEntryPermissionsOptions}; `entry` and `currentUserId`.
 * @returns A {@link TimeEntryPermissions} object; never `null` (every flag is always defined).
 */
export function useTimeEntryPermissions(options: UseTimeEntryPermissionsOptions): TimeEntryPermissions {
	const { entry, currentUserId } = options;
	return getTimeEntryPermissions(entry, currentUserId);
}
