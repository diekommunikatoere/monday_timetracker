// lib/database/permissions.ts
// DB-backed permission grants (`permission_grant`) and the effective-permission
// resolver used by API routes and the app-boot response.
//
// A grant targets EITHER a user (`user_id` = internal `user_profiles.id`) OR a monday
// team (`team_id` = monday team id, matched against `user_profiles.team_ids`, which
// refresh on every app boot). monday admins (`session.isAdmin`) implicitly hold every
// permission — they never need a grant row.
//
// All DB access uses `supabaseAdmin` (service-role, RLS-bypassing). Effective
// permissions are deliberately not cached: they are a single indexed query, and a
// revocation should take effect on the next request.

import { PERMISSION_DEFINITIONS, type PermissionKey } from "@/lib/permissions/keys";
import { supabaseAdmin } from "@/lib/supabase/server";

import type { Database } from "@/types/database";

type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];
/** Raw `permission_grant` row. */
export type PermissionGrant = Database["public"]["Tables"]["permission_grant"]["Row"];

/** Minimal user shape for pickers (`GET /api/users`). */
export interface AccountUser {
	id: string;
	name: string | null;
	photo_urls: UserProfile["photo_urls"];
}

/**
 * Resolve every permission `profile` holds.
 *
 * @param profile - The caller's `user_profiles` row (only `id` and `team_ids` are read).
 * @param isAdmin - `session.isAdmin` from the verified JWT; admins get every permission.
 * @returns Permission keys (deduplicated), or all keys for admins.
 */
export async function getEffectivePermissions(profile: Pick<UserProfile, "id" | "team_ids">, isAdmin: boolean): Promise<PermissionKey[]> {
	if (isAdmin) return PERMISSION_DEFINITIONS.map((d) => d.key);

	const teamIds = profile.team_ids ?? [];

	const [byUser, byTeam] = await Promise.all([supabaseAdmin.from("permission_grant").select("permission").eq("user_id", profile.id), teamIds.length > 0 ? supabaseAdmin.from("permission_grant").select("permission").in("team_id", teamIds) : Promise.resolve({ data: [], error: null })]);

	const error = byUser.error ?? byTeam.error;
	if (error) {
		console.error("Error resolving effective permissions:", error);
		throw error;
	}

	const data = [...(byUser.data ?? []), ...(byTeam.data ?? [])];
	return [...new Set(data.map((row) => row.permission as PermissionKey))];
}

/** Whether `profile` holds `key` (admins always do). */
export async function hasPermission(profile: Pick<UserProfile, "id" | "team_ids">, isAdmin: boolean, key: PermissionKey): Promise<boolean> {
	if (isAdmin) return true;
	return (await getEffectivePermissions(profile, false)).includes(key);
}

/** All grants, oldest first. Admin UI only. */
export async function listGrants(): Promise<PermissionGrant[]> {
	const { data, error } = await supabaseAdmin.from("permission_grant").select("*").order("created_at", { ascending: true });
	if (error) {
		console.error("Error listing permission grants:", error);
		throw error;
	}
	return data ?? [];
}

/**
 * Create a grant for exactly one of `userId` / `teamId`.
 *
 * @throws An error with `code === "23505"` (Postgres unique violation) if the grant already exists.
 */
export async function addGrant(grant: { permission: PermissionKey; userId?: string; teamId?: string; createdBy: string }): Promise<PermissionGrant> {
	const { data, error } = await supabaseAdmin
		.from("permission_grant")
		.insert({
			permission: grant.permission,
			user_id: grant.userId ?? null,
			team_id: grant.teamId ?? null,
			created_by: grant.createdBy,
		})
		.select()
		.single();

	if (error) throw error;
	return data;
}

/** Delete a grant by id. Deleting a non-existent id is a no-op. */
export async function removeGrant(id: string): Promise<void> {
	const { error } = await supabaseAdmin.from("permission_grant").delete().eq("id", id);
	if (error) {
		console.error("Error removing permission grant:", error);
		throw error;
	}
}

/**
 * Users of one monday account, sorted by name. Source for every user picker
 * (never the monday API — only people who have opened the app have a profile).
 */
export async function listAccountUsers(accountId: string): Promise<AccountUser[]> {
	const { data, error } = await supabaseAdmin.from("user_profiles").select("id, name, photo_urls").eq("monday_account_id", accountId).order("name", { ascending: true });
	if (error) {
		console.error("Error listing account users:", error);
		throw error;
	}
	return data ?? [];
}
