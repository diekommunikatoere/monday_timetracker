// lib/permissions/timeEntry.ts
// Ownership-based permission checks for individual time entries.
// Auth identity comes from the monday.com JWT session; `currentUserId` here is
// the internal Supabase `user_profiles.id`, not the monday user id.

import { Database } from "@/types/database";
import { TimeEntry } from "@/types/time-entry";

type TimeEntryColumn = keyof Database["public"]["Tables"]["time_entry"]["Update"];

/**
 * Fine-grained permission flags for a single {@link TimeEntry}, evaluated
 * against the currently authenticated user.
 *
 * All flags are **read-only results** — derive them via
 * {@link getTimeEntryPermissions} rather than constructing them manually.
 *
 * @property canView        - Always `true`; every authenticated user can view entries on an item they have access to.
 * @property canCreate      - `true` when a `currentUserId` is present (i.e. the user is authenticated).
 * @property canEdit        - `true` when the authenticated user owns the entry (`entry.user_id === currentUserId`)
 *                            or holds `time_entries.manage_others`.
 * @property canDelete      - `true` for the entry owner or a user with `time_entries.manage_others`.
 * @property canBulkSelect  - `true` only for the entry owner; bulk actions never touch other users' entries.
 */
export interface TimeEntryPermissions {
	canView: boolean; // Always true for item entries
	canCreate: boolean; // True for authenticated users
	canEdit: boolean; // Entry owner or privileged (manage_others)
	canDelete: boolean; // Entry owner or privileged (manage_others)
	canBulkSelect: boolean; // True only for own entries
}

/**
 * Derives the full set of {@link TimeEntryPermissions} for a time entry,
 * relative to the currently logged-in user.
 *
 * Ownership is determined by comparing `entry.user_id` (Supabase
 * `user_profiles.id`) with `currentUserId`. Privileged users (those holding
 * `time_entries.manage_others` — monday admins hold it implicitly) may also
 * edit and delete other users' entries; the caller resolves that flag (see
 * `useHasPermission` on the client, `hasPermission` on the server) and passes
 * it as `canManageOthers`. The server re-checks it independently.
 *
 * @param entry           - The {@link TimeEntry} to evaluate. Only `entry.user_id` is read.
 * @param currentUserId   - Supabase `user_profiles.id` of the authenticated user,
 *                          or `undefined` when unauthenticated. Pass `undefined`
 *                          to get the lowest-privilege result (`canCreate: false`).
 * @param canManageOthers - Whether the user holds `time_entries.manage_others`. Ignored when unauthenticated.
 * @returns A {@link TimeEntryPermissions} object with all flags set.
 */
export function getTimeEntryPermissions(entry: TimeEntry, currentUserId: string | undefined, canManageOthers = false): TimeEntryPermissions {
	const isOwner = !!currentUserId && entry.user_id === currentUserId;
	const isPrivileged = !!currentUserId && canManageOthers;

	return {
		canView: true,
		canCreate: !!currentUserId,
		canEdit: isOwner || isPrivileged,
		canDelete: isOwner || isPrivileged,
		canBulkSelect: isOwner,
	};
}

/**
 * Columns a user may change on their OWN time entry. System-managed columns
 * (user_id, timer_state, deleted_*, synced_to_monday, created_*, updated_*, id)
 * are intentionally excluded — see updateTimeEntry in lib/database.ts.
 */
export const SELF_EDITABLE_TIME_ENTRY_FIELDS = ["board_id", "item_id", "role_id", "comment", "duration", "start_time", "end_time"] as const satisfies readonly TimeEntryColumn[];

/**
 * Columns a user with `time_entries.manage_others` may change on ANY time entry:
 * the self-editable set plus `user_id` (reassignment to another user of the same account).
 */
export const PRIVILEGED_EDITABLE_TIME_ENTRY_FIELDS = [...SELF_EDITABLE_TIME_ENTRY_FIELDS, "user_id"] as const satisfies readonly TimeEntryColumn[];
