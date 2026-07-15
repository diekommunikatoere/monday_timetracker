import { create } from "zustand";
import { getMondaySdk } from "@/lib/monday-browser-sdk";
import { useUserStore, MondayTheme, mapMondayThemeToAppTheme } from "./userStore";

/**
 * The monday SDK bridge and the app's boot store. Holds the raw monday context
 * and the session token that every other store and API call authenticates with.
 * `initializeMondayContext` is the entry point each page runs on mount. Not persisted.
 */
interface MondayState {
	/** Raw context object returned by the monday SDK. */
	rawContext: any;
	/** Signed monday session token (JWT) sent as `Authorization: Bearer …` on API calls. */
	sessionToken: string | null;
	isLoading: boolean;
	/** True once the initial context + user load has completed. */
	isInitialized: boolean;
	/** True once the `monday.listen("context")` listener has been registered. */
	isListenerSetup: boolean;
	error: string | null;
	/** Current platform theme reported by monday, tracked for theme syncing. */
	mondayTheme: MondayTheme | null;

	/**
	 * Boot the app: fetch context + session token in parallel, populate `userStore`,
	 * authenticate against `/api/auth/monday-user` (which also resolves the monday
	 * user's name/email/photos server-side), and wire up the context listener.
	 * Idempotent once initialized (unless a prior error).
	 */
	initializeMondayContext: () => Promise<void>;
	setRawContext: (context: any) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	/** Register the `monday.listen("context")` listener for live theme updates. Idempotent. */
	setupContextListener: () => void;
}

export const useMondayStore = create<MondayState>()((set, get) => ({
	rawContext: null,
	sessionToken: null,
	isLoading: true,
	isInitialized: false,
	isListenerSetup: false,
	error: null,
	mondayTheme: null,

	initializeMondayContext: async () => {
		// Prevent multiple initialization calls if already in progress or completed
		if (get().isInitialized && !get().error) {
			return;
		}

		const startTime = Date.now();
		try {
			set({ isLoading: true, error: null });

			// OPTIMIZATION: Fetch context and session token in PARALLEL
			const monday = getMondaySdk();
			const [contextResult, sessionTokenResult] = await Promise.all([monday.get("context"), monday.get("sessionToken")]);

			if (!contextResult?.data?.user) {
				throw new Error("No user found in Monday.com context");
			}

			const sessionToken = sessionTokenResult?.data || null;

			// Update theme first to avoid flicker during rest of initialization
			const mondayTheme = contextResult?.data?.theme as MondayTheme;
			if (mondayTheme) {
				set({ mondayTheme });
				// Also update user store theme for consistency
				useUserStore.setState({ theme: mondayTheme, appTheme: mapMondayThemeToAppTheme(mondayTheme) });
			}

			set({ rawContext: contextResult, sessionToken, isInitialized: true });

			// Update user store with Monday user info. `email`/`name`/`photoUrls` are
			// filled in below once `/api/auth/monday-user` resolves them server-side
			// (avoids the deprecated client-side `monday.api()` GraphQL call).
			const mondayUser = {
				id: contextResult.data.user.id,
				accountId: contextResult.data.account.id,
				email: null as string | null,
				name: null as string | null,
				photoUrls: null as any,
				isAdmin: contextResult.data.user.isAdmin || false,
				isGuest: contextResult.data.user.isGuest || false,
				isViewOnly: contextResult.data.user.isViewOnly || false,
				countryCode: contextResult.data.user.countryCode || "",
				currentLanguage: contextResult.data.user.currentLanguage || "",
				timeFormat: contextResult.data.user.timeFormat || "24H",
				timeZoneOffset: contextResult.data.user.timeZoneOffset || 0,
			};

			useUserStore.setState({ mondayUser });

			// Authenticate user through API route (creates/finds Supabase user).
			// This also resolves the user's name/email/photos server-side via
			// `getUserDetails` in `lib/monday.ts`.
			const authStartTime = Date.now();
			const response = await fetch("/api/auth/monday-user", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
				},
			});

			if (!response.ok) {
				throw new Error("Failed to authenticate user");
			}

			const { userProfile, mondayUser: mondayUserDetails } = await response.json();

			// Update user store with Supabase user + the server-resolved monday user details
			useUserStore.setState({
				mondayUser: {
					...mondayUser,
					email: mondayUserDetails?.email ?? null,
					name: mondayUserDetails?.name ?? null,
					photoUrls: mondayUserDetails?.photo_urls ?? null,
				},
				supabaseUser: userProfile,
				authenticated: true,
			});

			// If user has a persisted theme preference, apply it
			if (userProfile.theme) {
				const persistedTheme = userProfile.theme as MondayTheme;
				useUserStore.setState({
					theme: persistedTheme,
					appTheme: mapMondayThemeToAppTheme(persistedTheme),
				});
			}

			// Automatically setup context listener after initialization
			get().setupContextListener();
			set({ isLoading: false });
		} catch (err) {
			console.error("Error initializing Monday user:", err);
			set({
				error: err instanceof Error ? err.message : "Unknown error",
				isLoading: false,
			});
		}
	},

	setRawContext: (context) => set({ rawContext: context }),
	setLoading: (loading) => set({ isLoading: loading }),
	setError: (error) => set({ error }),

	/**
	 * Sets up the monday.listen("context", ...) listener to reactively handle theme changes.
	 * This should be called once during app initialization.
	 */
	setupContextListener: () => {
		if (get().isListenerSetup) {
			return;
		}
		set({ isListenerSetup: true });

		getMondaySdk().listen("context", (res: any) => {
			const contextData = res?.data;
			if (!contextData) {
				return;
			}

			// Update raw context
			set({ rawContext: res });

			// NOTE: We no longer automatically sync the platform theme to the userStore
			// to prevent reversion loops when the user has manually selected a theme.
			// The theme is now primarily managed by the userStore and persisted in the DB.
			const newTheme = contextData.theme as MondayTheme;
			if (newTheme) {
				set({ mondayTheme: newTheme });
			}
		});
	},
}));
