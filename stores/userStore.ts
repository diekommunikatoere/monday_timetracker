// stores/userStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

// function specific imports
import { useState, useEffect, useCallback } from "react";
import mondaySdk from "monday-sdk-js";

const monday = mondaySdk();

type MondayUser = {
	id: string;
	accountId: string;
	email: string | null;
	name: string | null;
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

	// Theme preferences
	theme: "black" | "light" | "dark";

	// Authentication status
	authenticated: boolean;

	// Actions
	setMondayUser: (user: UserState["mondayUser"]) => void;
	setSupabaseUser: (user: UserState["supabaseUser"]) => void;
	setTheme: (theme: UserState["theme"]) => void;
}

export const useUserStore = create<UserState>()(
	persist(
		(set) => ({
			mondayUser: null,
			supabaseUser: null,
			theme: "black",
			authenticated: false,

			setMondayUser: async () => {
				const context = await monday.get("context");
				set({
					mondayUser: {
						id: context?.data?.user?.id || null,
						accountId: context?.data?.account?.id || null,
						email: null,
						name: null,
						isAdmin: context?.data?.user?.isAdmin || false,
						isGuest: context?.data?.user?.isGuest || false,
						isViewOnly: context?.data?.user?.isViewOnly || false,
						countryCode: context?.data?.user?.countryCode || "",
						currentLanguage: context?.data?.user?.currentLanguage || "",
						timeFormat: context?.data?.user?.timeFormat || "24H",
						timeZoneOffset: context?.data?.user?.timeZoneOffset || 0,
					},
				});
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
			setTheme: (theme) => set({ theme }),
			setAuthenticated: async () => {
				// Find or create user in our database
				const response = await fetch("/api/auth/monday-user", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						mondayUserId: useUserStore.getState().mondayUser?.id,
						mondayAccountId: useUserStore.getState().mondayUser?.accountId,
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
		}
	)
);
