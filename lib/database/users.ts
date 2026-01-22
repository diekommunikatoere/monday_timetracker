import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];
type UserProfileInsert = Database["public"]["Tables"]["user_profiles"]["Insert"];

/**
 * Find or create a user profile based on Monday.com user ID
 * This is the main function you'll use when the app loads
 */
export async function findOrCreateUserByMondayId(mondayUserId: string, mondayAccountId: string, email?: string, name?: string, teamIds?: string[]): Promise<UserProfile> {
	// First, try to find existing user by Monday ID
	const { data: existingUser, error: findError } = await supabaseAdmin.from("user_profiles").select("*").eq("monday_user_id", mondayUserId).single();

	// If user exists, update them with latest info (including teams) and return
	if (existingUser && !findError) {
		console.log(`✅ Found existing user: ${existingUser.id}, updating profile...`);

		const updates: any = {
			updated_at: new Date().toISOString(),
		};

		if (email) updates.email = email;
		if (name) updates.name = name;
		if (teamIds) updates.team_ids = teamIds;

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
	console.log(`📝 Creating new user for Monday ID: ${mondayUserId}`);

	const newUser: UserProfileInsert = {
		id: crypto.randomUUID(), // Generate Supabase user ID
		monday_user_id: mondayUserId,
		monday_account_id: mondayAccountId,
		email: email || null,
		name: name || null,
		team_ids: teamIds || null,
	};

	const { data: createdUser, error: createError } = await supabaseAdmin.from("user_profiles").insert(newUser).select().single();

	if (createError) {
		console.error("Error creating user:", createError);
		throw createError;
	}

	console.log(`✅ Created new user: ${createdUser.id}`);
	return createdUser;
}

/**
 * Get user profile by Supabase user ID
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
 * Update user profile (e.g., if Monday.com info changes)
 */
export async function updateUserProfile(
	userId: string,
	updates: {
		email?: string;
		name?: string;
	},
): Promise<UserProfile> {
	const { data, error } = await supabaseAdmin.from("user_profiles").update(updates).eq("id", userId).select().single();

	if (error) {
		console.error("Error updating user profile:", error);
		throw error;
	}

	return data;
}
