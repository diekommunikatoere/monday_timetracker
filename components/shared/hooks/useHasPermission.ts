// components/shared/hooks/useHasPermission.ts
"use client";

import { useUserStore } from "@/stores/userStore";

import type { PermissionKey } from "@/lib/permissions/keys";

/**
 * Whether the current user holds permission `key`: monday admins implicitly hold every
 * permission; everyone else needs the key in `userStore.permissions` (populated on app boot
 * from `/api/auth/monday-user`). UI gating only — API routes re-check server-side.
 */
export function useHasPermission(key: PermissionKey): boolean {
	const isAdmin = useUserStore((state) => !!(state.mondayUser?.isAdmin ?? state.supabaseUser?.is_admin));
	const permissions = useUserStore((state) => state.permissions);
	return isAdmin || permissions.includes(key);
}
