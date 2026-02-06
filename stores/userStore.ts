// stores/userStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMondayStore } from "./mondayStore";

// function specific imports
import { useState, useEffect, useCallback } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

// Monday.com theme values from context
export type MondayTheme = "black" | "light" | "dark";

// Mapped theme values for the application
export type AppTheme = "light" | "dark";

/**
 * Maps Monday.com theme values to application theme values.
 * - "light" -> "light"
 * - "dark" | "black" -> "dark"
 */
export function mapMondayThemeToAppTheme(mondayTheme: MondayTheme): AppTheme {
	if (mondayTheme === "light") {
		return "light";
	}
	// Both "dark" and "black" map to "dark"
	return "dark";
}

type MondayUser = {
	id: string;
	accountId: string;
	email: string | null;
	name: string | null;
	photoUrls: {
		original: string | null;
		small: string | null;
		thumb: string | null;
		thumb_small: string | null;
		tiny: string | null;
	} | null;
	isAdmin: boolean;
	isGuest: boolean;
	isViewOnly: boolean;
	countryCode: string;
	currentLanguage: string;
	timeFormat: string | "12H" | "24H";
	timeZoneOffset: number;
} | null;

type SupabaseUser = {
	id: string;
	email: string;
} | null;

interface UserState {
	// Monday.com user data
	mondayUser: MondayUser;

	// Supabase user data
	supabaseUser: SupabaseUser;

	// Theme preferences - stores the raw Monday theme value
	theme: MondayTheme;

	// Computed app theme (light/dark)
	appTheme: AppTheme;

	// Authentication status
	authenticated: boolean;

	// Actions
	setMondayUser: (user: UserState["mondayUser"]) => void;
	setSupabaseUser: (user: UserState["supabaseUser"]) => void;
	toggleTheme: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
	persist(
		(set, get) => ({
			mondayUser: null,
			supabaseUser: null,
			theme: "black",
			appTheme: "dark",
			authenticated: false,

			setMondayUser: async () => {
				const context = await monday.get("context");

				// Extract theme from context
				const mondayTheme = (context?.data?.theme as MondayTheme) || "black";
				const appTheme = mapMondayThemeToAppTheme(mondayTheme);

				set({
					mondayUser: {
						id: context?.data?.user?.id || null,
						accountId: context?.data?.account?.id || null,
						email: null,
						name: null,
						photoUrls: null,
						isAdmin: context?.data?.user?.isAdmin || false,
						isGuest: context?.data?.user?.isGuest || false,
						isViewOnly: context?.data?.user?.isViewOnly || false,
						countryCode: context?.data?.user?.countryCode || "",
						currentLanguage: context?.data?.user?.currentLanguage || "",
						timeFormat: context?.data?.user?.timeFormat || "24H",
						timeZoneOffset: context?.data?.user?.timeZoneOffset || 0,
					},
					theme: mondayTheme,
					appTheme,
				});

				console.log(`[setMondayUser] Theme initialized: ${mondayTheme} -> ${appTheme}`);
			},
			setSupabaseUser: () => {
				console.log("Setting Supabase user...");
				if (!useUserStore.getState().mondayUser || !useUserStore.getState().authenticated) return;

				const user = {
					id: useUserStore.getState().mondayUser!.id,
					email: useUserStore.getState().mondayUser!.email || "",
				};
				set({ supabaseUser: user });
				console.log("Supabase user set:", user);
			},
			toggleTheme: async () => {
				const currentTheme = get().theme;
				const newTheme: MondayTheme = currentTheme === "light" ? "dark" : "light";
				const appTheme = mapMondayThemeToAppTheme(newTheme);

				// Update local state synchronously
				set({ theme: newTheme, appTheme });

				// Persist to database asynchronously
				try {
					const mondayUserId = get().mondayUser?.id;
					if (!mondayUserId) return;

					const sessionToken = useMondayStore.getState().sessionToken;
					if (!sessionToken) return;

					// Get fresh context for authentication header
					const context = await monday.get("context");

					await fetch("/api/user/theme", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"monday-context": JSON.stringify(context),
							Authorization: `Bearer ${sessionToken}`,
						},
						body: JSON.stringify({ theme: newTheme }),
					});
				} catch (error) {
					console.error("Failed to persist theme change:", error);
				}
			},
			setAuthenticated: async () => {
				const sessionToken = useMondayStore.getState().sessionToken;
				if (!sessionToken) return;

				// Find or create user in our database
				const response = await fetch("/api/auth/monday-user", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${sessionToken}`,
					},
					body: JSON.stringify({
						email: useUserStore.getState().mondayUser?.email,
						name: useUserStore.getState().mondayUser?.name,
					}),
				});

				if (!response.ok) {
					set({ authenticated: false });
					throw new Error("Failed to authenticate user");
				}

				set({ authenticated: true });
			},
		}),
		{
			name: "user-store",
			skipHydration: true, // Important for Next.js SSR
			partialize: (state) => ({
				theme: state.theme,
				// Don't persist user data - it's session-based
			}),
		},
	),
);
