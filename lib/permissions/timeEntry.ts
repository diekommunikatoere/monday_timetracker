// lib/permissions/timeEntry.ts
// Ownership-based permission checks for individual time entries.
// Auth identity comes from the monday.com JWT session; `currentUserId` here is
// the internal Supabase `user_profiles.id`, not the monday user id.

import { TimeEntry } from "@/types/time-entry";

/**
 * Fine-grained permission flags for a single {@link TimeEntry}, evaluated
 * against the currently authenticated user.
 *
 * All flags are **read-only results** — derive them via
 * {@link getTimeEntryPermissions} rather than constructing them manually.
 *
 * @property canView        - Always `true`; every authenticated user can view entries on an item they have access to.
 * @property canCreate      - `true` when a `currentUserId` is present (i.e. the user is authenticated).
 * @property canEdit        - `true` only when the authenticated user owns the entry (`entry.user_id === currentUserId`).
 * @property canDelete      - `true` only for the entry owner.
 * @property canBulkSelect  - `true` only for the entry owner; prevents bulk-editing other users' entries.
 */
export interface TimeEntryPermissions {
	canView: boolean; // Always true for item entries
	canCreate: boolean; // True for authenticated users
	canEdit: boolean; // True only for entry owner
	canDelete: boolean; // True only for entry owner
	canBulkSelect: boolean; // True only for own entries
}

/**
 * Derives the full set of {@link TimeEntryPermissions} for a time entry,
 * relative to the currently logged-in user.
 *
 * Ownership is determined by comparing `entry.user_id` (Supabase
 * `user_profiles.id`) with `currentUserId`. Admin-role elevation is **not**
 * considered here — admin gates live at the API route level via
 * `session.isAdmin` from `verifyMondayJwt`.
 *
 * @param entry         - The {@link TimeEntry} to evaluate. Only `entry.user_id` is read.
 * @param currentUserId - Supabase `user_profiles.id` of the authenticated user,
 *                        or `undefined` when unauthenticated. Pass `undefined`
 *                        to get the lowest-privilege result (`canCreate: false`).
 * @returns A {@link TimeEntryPermissions} object with all flags set.
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
