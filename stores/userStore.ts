import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMondayStore } from "./mondayStore";
import { getMondaySdk } from "@/lib/monday-browser-sdk";

/** Raw theme value as reported by the monday context. */
export type MondayTheme = "black" | "light" | "dark";

/** Theme the app actually renders with (monday's "black" collapses to "dark"). */
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

/**
 * The authenticated user: monday identity, the linked Supabase profile, and
 * theme preference. Only `theme` is persisted (localStorage) — user data is
 * session-based and repopulated on boot. In practice these fields are populated
 * by `mondayStore.initializeMondayContext`; the setters below are secondary
 * entry points used by a few flows.
 */
interface UserState {
	/** monday identity + profile flags, or null before init. */
	mondayUser: MondayUser;

	/** Linked Supabase user, or null until authenticated. */
	supabaseUser: SupabaseUser;

	/** Persisted theme preference, stored as the raw monday theme value. */
	theme: MondayTheme;

	/** Theme actually rendered, derived from `theme`. */
	appTheme: AppTheme;

	authenticated: boolean;

	setMondayUser: (user: UserState["mondayUser"]) => void;
	setSupabaseUser: (user: UserState["supabaseUser"]) => void;
	/** Flip light/dark, update derived `appTheme`, and persist to the DB via `/api/user/theme`. */
	setTheme: (newTheme: AppTheme) => Promise<void>;
}

export const useUserStore = create<UserState>()(
	persist(
		(set, get) => ({
			mondayUser: null,
			supabaseUser: null,
			theme: "black",
			appTheme: "dark",
			authenticated: false,

			/**
			 * Populate `mondayUser` and theme directly from the monday context — a
			 * lighter alternative to the full `mondayStore` boot flow.
			 */
			setMondayUser: async () => {
				const context = await getMondaySdk().get("context");

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
			},
			/** Derive `supabaseUser` from the already-loaded monday user; no-op until authenticated. */
			setSupabaseUser: () => {
				if (!useUserStore.getState().mondayUser || !useUserStore.getState().authenticated) return;

				const user = {
					id: useUserStore.getState().mondayUser!.id,
					email: useUserStore.getState().mondayUser!.email || "",
				};
				set({ supabaseUser: user });
			},
			setTheme: async (newTheme: AppTheme) => {
				const currentTheme = get().theme;
				const mondayTheme: MondayTheme = newTheme === "light" ? "light" : "dark";
				const appTheme = mapMondayThemeToAppTheme(mondayTheme);

				// Update local state synchronously
				set({ theme: mondayTheme, appTheme });

				// Persist to database asynchronously
				try {
					const mondayUserId = get().mondayUser?.id;
					if (!mondayUserId) return;

					const sessionToken = useMondayStore.getState().sessionToken;
					if (!sessionToken) return;

					// Get fresh context for authentication header
					const context = await getMondaySdk().get("context");

					await fetch("/api/user/theme", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"monday-context": JSON.stringify(context),
							Authorization: `Bearer ${sessionToken}`,
						},
						body: JSON.stringify({ theme: mondayTheme }),
					});
				} catch (error) {
					console.error("Failed to persist theme change:", error);
				}
			},
			/**
			 * Find or create the Supabase user for the current monday session via
			 * `/api/auth/monday-user`, then flip `authenticated`. Not declared on
			 * `UserState` — `mondayStore` runs this during the main boot flow.
			 */
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
