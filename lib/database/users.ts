// lib/database/users.ts
// User-profile CRUD over the `user_profiles` Supabase table.
//
// The app has no auth of its own — identity comes from monday.com. These
// functions bridge the monday user ID (from the verified JWT session) to the
// internal `user_profiles.id` (a Supabase UUID used as the FK everywhere else).
//
// Typical call sequence on every authenticated request:
//   1. `verifyMondayJwt(authHeader)` → `{ userId, accountId, isAdmin }` (lib/monday-auth.ts)
//   2. `getUserProfileByMondayId(userId)` or `findOrCreateUserByMondayId(...)` (this file)
//   3. Operate on data by the returned `user_profiles.id`.
//
// All DB access uses `supabaseAdmin` (service-role, RLS-bypassing).

import { supabaseAdmin } from "@/lib/supabase/server";

import type { Database } from "@/types/database";

/** Raw `user_profiles` table row from the generated DB types. */
type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];
/** Insert shape for `user_profiles`. */
type UserProfileInsert = Database["public"]["Tables"]["user_profiles"]["Insert"];

/**
 * Resolve or create the `user_profiles` row for a monday.com user.
 *
 * **This is the primary entry point** used when the app boots
 * (`/api/auth/monday-user`). It handles two cases:
 *
 * - **Existing user** — updates mutable fields (`email`, `name`, `team_ids`,
 *   `photo_urls`, `is_admin`) with the latest monday data, then returns the
 *   updated row. If the update itself fails, returns the stale existing row so
 *   authentication is never blocked by a transient DB error.
 * - **New user** — inserts a row with a freshly-generated `crypto.randomUUID()`
 *   as the Supabase `id` (the internal PK used as FK everywhere else).
 *
 * @param mondayUserId    - The monday user ID from the signed JWT (`session.userId`).
 * @param mondayAccountId - The monday account ID from the signed JWT (`session.accountId`).
 * @param email           - Optional. Updated on every call when present.
 * @param name            - Optional. Display name from the monday `/me` endpoint.
 * @param teamIds         - Optional. monday team memberships.
 * @param photoUrls       - Optional. monday avatar URLs at multiple sizes.
 * @param isAdmin         - Optional. Mirrors `session.isAdmin` from the JWT.
 * @returns The current (inserted or updated) `user_profiles` row.
 */
export async function findOrCreateUserByMondayId(mondayUserId: string, mondayAccountId: string, email?: string, name?: string, teamIds?: string[], photoUrls?: any, isAdmin?: boolean): Promise<UserProfile> {
	// First, try to find existing user by Monday ID
	const { data: existingUser, error: findError } = await supabaseAdmin.from("user_profiles").select("*").eq("monday_user_id", mondayUserId).single();

	// If user exists, update them with latest info (including teams) and return
	if (existingUser && !findError) {
		const updates: any = {
			updated_at: new Date().toISOString(),
		};

		if (email) updates.email = email;
		if (name) updates.name = name;
		if (teamIds) updates.team_ids = teamIds;
		if (photoUrls) updates.photo_urls = photoUrls;
		if (isAdmin !== undefined) updates.is_admin = isAdmin;

		const { data: updatedUser, error: updateError } = await supabaseAdmin.from("user_profiles").update(updates).eq("id", existingUser.id).select().single();

		if (updateError) {
			console.error("Error updating existing user:", updateError);
			// Return existing user even if update fails, to not block login
			return existingUser;
		}

		return updatedUser;
	}

	// If error is something other than "not found", throw it
	if (findError && findError.code !== "PGRST116") {
		console.error("Error finding user:", findError);
		throw findError;
	}

	// User doesn't exist - create new one
	const newUser: UserProfileInsert = {
		id: crypto.randomUUID(), // Generate Supabase user ID
		monday_user_id: mondayUserId,
		monday_account_id: mondayAccountId,
		email: email || null,
		name: name || null,
		team_ids: teamIds || null,
		photo_urls: photoUrls || null,
		is_admin: isAdmin || false,
	};

	const { data: createdUser, error: createError } = await supabaseAdmin.from("user_profiles").insert(newUser).select().single();

	if (createError) {
		console.error("Error creating user:", createError);
		throw createError;
	}

	return createdUser;
}

/**
 * Look up a `user_profiles` row by monday user ID without side-effects.
 *
 * Use this on every authenticated request after JWT verification when you do
 * **not** want to upsert (i.e. you only need the internal `user_profiles.id`
 * and don't expect a first-time user). Returns `null` rather than throwing
 * when the user is not found (Supabase `PGRST116`). All other DB errors are
 * re-thrown.
 *
 * @param mondayUserId - The monday user ID string from the verified JWT.
 * @returns The `user_profiles` row, or `null` if no matching row exists.
 */
export async function getUserProfileByMondayId(mondayUserId: string): Promise<UserProfile | null> {
	const { data, error } = await supabaseAdmin.from("user_profiles").select("*").eq("monday_user_id", mondayUserId).single();

	if (error) {
		if (error.code === "PGRST116") {
			// User not found
			return null;
		}
		console.error("Error fetching user profile by Monday ID:", error);
		throw error;
	}

	return data;
}

/**
 * Look up a `user_profiles` row by the internal Supabase UUID (`user_profiles.id`).
 *
 * Use this when you already have the internal ID (e.g. from a `time_entry.user_id`
 * FK) and need the full profile. Prefer {@link getUserProfileByMondayId} when
 * you only have the monday user ID from the JWT. Returns `null` on not-found
 * (`PGRST116`); re-throws other DB errors.
 *
 * @param userId - The internal `user_profiles.id` UUID (not the monday user ID).
 * @returns The `user_profiles` row, or `null` if no matching row exists.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
	const { data, error } = await supabaseAdmin.from("user_profiles").select("*").eq("id", userId).single();

	if (error) {
		if (error.code === "PGRST116") {
			// User not found
			return null;
		}
		console.error("Error fetching user profile:", error);
		throw error;
	}

	return data;
}

/**
 * Persist a user's explicit theme choice to `user_profiles.theme`.
 *
 * Called by `/api/user/theme` (PATCH). The stored theme takes precedence over
 * the monday platform theme at render time — do **not** overwrite this field
 * with the platform theme (that caused reversion loops; see CLAUDE.md §Styling).
 *
 * @param mondayUserId - The monday user ID string from the verified JWT.
 * @param theme        - Theme identifier (e.g. `"light"`, `"dark"`, `"black"`).
 */
export async function updateUserThemeByMondayId(mondayUserId: string, theme: string): Promise<void> {
	const { error } = await supabaseAdmin.from("user_profiles").update({ theme, updated_at: new Date().toISOString() }).eq("monday_user_id", mondayUserId);

	if (error) {
		console.error("Error updating user theme:", error);
		throw error;
	}
}

/**
 * Patch arbitrary fields on a `user_profiles` row by internal Supabase UUID.
 *
 * Accepts a narrow subset of mutable fields: `email`, `name`, `theme`.
 * Prefer {@link updateUserThemeByMondayId} for theme-only updates (it uses the
 * monday user ID, which is what most call sites have). Use this function when
 * you have the internal `user_profiles.id` and need to update more than one
 * field in one round trip.
 *
 * @param userId  - The internal `user_profiles.id` UUID (not the monday user ID).
 * @param updates - Partial set of fields to patch.
 * @returns The updated `user_profiles` row.
 */
export async function updateUserProfile(
	userId: string,
	updates: {
		email?: string;
		name?: string;
		theme?: string;
	},
): Promise<UserProfile> {
	const { data, error } = await supabaseAdmin.from("user_profiles").update(updates).eq("id", userId).select().single();

	if (error) {
		console.error("Error updating user profile:", error);
		throw error;
	}

	return data;
}
