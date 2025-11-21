// hooks/useMondayContext.ts
"use client";

import { useEffect, useState } from "react";
import mondaySdk from "monday-sdk-js";
import { useMondayStore } from "@/stores/mondayStore";
import { useUserStore } from "@/stores/userStore";
import { supabase } from "@/lib/supabase/client";
import { useHydration } from "@/lib/store-utils";
import type { MondayContext } from "@/types/monday";
import type { Database } from "@/types/database";

const monday = mondaySdk();

type UserProfile = Database["public"]["Tables"]["user_profiles"]["Row"];

interface UseMondayContextReturn {
	rawContext: MondayContext | null;
	mondayUser: MondayContext["user"] | null;
	userProfile: UserProfile | null;
	loading: boolean;
	error: string | null;
}

export function useMondayContext(): UseMondayContextReturn {
	const hydrated = useHydration();
	const rawContext = useMondayStore((state) => (hydrated ? state.rawContext : null));
	const setRawContext = useMondayStore((state) => state.setRawContext);
	const userProfile = useUserStore((state) => (hydrated ? state.supabaseUser : null));
	const setUserProfile = useUserStore((state) => state.setSupabaseUser);

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Load monday context on mount
	useEffect(() => {
		if (!hydrated) return;

		const loadContext = async () => {
			try {
				setLoading(true);
				setError(null);

				// Get monday.com context
				const context = await monday.get("context");
				setRawContext(context.data as MondayContext);

				// Fetch user profile from Supabase
				const mondayUserId = (context.data as MondayContext).user.id;
				const { data: profile, error: profileError } = await supabase.from("user_profiles").select("*").eq("monday_user_id", mondayUserId).single();

				if (profileError) {
					// User might not exist yet - this is normal for first-time users
					console.warn("User profile not found:", profileError);
					setUserProfile(null);
				} else {
					setUserProfile(profile);
				}
			} catch (err: any) {
				console.error("Failed to load monday context:", err);
				setError(err.message || "Failed to load monday context");
			} finally {
				setLoading(false);
			}
		};

		loadContext();
	}, [hydrated, setRawContext, setUserProfile]);

	if (!hydrated) {
		return {
			rawContext: null,
			mondayUser: null,
			userProfile: null,
			loading: true,
			error: null,
		};
	}

	return {
		rawContext,
		mondayUser: rawContext?.user || null,
		userProfile,
		loading,
		error,
	};
}
