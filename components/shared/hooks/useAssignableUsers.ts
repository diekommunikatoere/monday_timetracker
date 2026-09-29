// components/shared/hooks/useAssignableUsers.ts
"use client";

import { useQuery } from "@tanstack/react-query";

import { PERMISSIONS } from "@/lib/permissions/keys";
import { useMondayStore } from "@/stores/mondayStore";

import { useHasPermission } from "./useHasPermission";

/**
 * A user of the caller's monday account, as returned by `GET /api/users`
 * (`user_profiles` rows — only people who have opened the app exist here).
 *
 * @property id         - Internal `user_profiles.id` (what `time_entry.user_id` references).
 * @property name       - monday display name; may be `null` for a profile that never resolved one.
 * @property photo_urls - monday avatar URLs at several sizes (`thumb_small` is used in pickers).
 */
export interface AssignableUser {
	id: string;
	name: string | null;
	photo_urls: { thumb_small?: string | null; [size: string]: string | null | undefined } | null;
}

/**
 * Fetch of the users an entry can be booked for / reassigned to. The endpoint requires
 * `time_entries.manage_others`, so the query is enabled only for users holding it (admins
 * implicitly) — everyone else gets `users: []` without a request. Shared query key
 * `["assignable-users"]`, so the admin permissions tab and the entry modals use one cache entry.
 *
 * @returns `{ users, isLoading }` — `users` is `[]` until loaded (or when not permitted).
 */
export function useAssignableUsers() {
	const canManageOthers = useHasPermission(PERMISSIONS.MANAGE_OTHERS_ENTRIES);
	const sessionToken = useMondayStore((state) => state.sessionToken);

	const { data: users = [], isLoading } = useQuery({
		queryKey: ["assignable-users"],
		queryFn: async (): Promise<AssignableUser[]> => {
			const response = await fetch("/api/users", { headers: { Authorization: `Bearer ${sessionToken}` } });
			if (!response.ok) throw new Error("Benutzer konnten nicht geladen werden");
			const { users } = await response.json();
			return users;
		},
		enabled: canManageOthers && !!sessionToken,
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});

	return { users, isLoading };
}
