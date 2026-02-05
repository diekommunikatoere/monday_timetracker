// stores/mondayStore.ts
import { create } from "zustand";
import mondaySdk from "monday-sdk-js";
import { useUserStore, MondayTheme, mapMondayThemeToAppTheme } from "./userStore";

const monday = mondaySdk();

interface MondayState {
	rawContext: any;
	isLoading: boolean;
	isInitialized: boolean;
	isListenerSetup: boolean;
	error: string | null;
	mondayTheme: MondayTheme | null;

	initializeMondayContext: () => Promise<void>;
	setRawContext: (context: any) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
	setupContextListener: () => void;
}

export const useMondayStore = create<MondayState>()((set, get) => ({
	rawContext: null,
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

			// OPTIMIZATION: Fetch context and user data in PARALLEL
			// This reduces initialization time by ~30-50%
			const [contextResult, userResult] = await Promise.all([monday.get("context"), monday.api(`query { me { id name email photo_original photo_small photo_thumb photo_thumb_small photo_tiny } }`)]);

			if (!contextResult?.data?.user) {
				throw new Error("No user found in Monday.com context");
			}

			// Update theme first to avoid flicker during rest of initialization
			const mondayTheme = contextResult?.data?.theme as MondayTheme;
			if (mondayTheme) {
				set({ mondayTheme });
				// Also update user store theme for consistency
				useUserStore.setState({ theme: mondayTheme, appTheme: mapMondayThemeToAppTheme(mondayTheme) });
			}

			set({ rawContext: contextResult, isInitialized: true });

			// Update user store with Monday user info
			const mondayUser = {
				id: contextResult.data.user.id,
				accountId: contextResult.data.account.id,
				email: userResult?.data?.me?.email || null,
				name: userResult?.data?.me?.name || null,
				photoUrls: userResult?.data?.me
					? {
							original: userResult.data.me.photo_original,
							small: userResult.data.me.photo_small,
							thumb: userResult.data.me.photo_thumb,
							thumb_small: userResult.data.me.photo_thumb_small,
							tiny: userResult.data.me.photo_tiny,
						}
					: null,
				isAdmin: contextResult.data.user.isAdmin || false,
				isGuest: contextResult.data.user.isGuest || false,
				isViewOnly: contextResult.data.user.isViewOnly || false,
				countryCode: contextResult.data.user.countryCode || "",
				currentLanguage: contextResult.data.user.currentLanguage || "",
				timeFormat: contextResult.data.user.timeFormat || "24H",
				timeZoneOffset: contextResult.data.user.timeZoneOffset || 0,
			};

			useUserStore.setState({ mondayUser });

			// Authenticate user through API route (creates/finds Supabase user)
			// Note: This still needs to be sequential as it depends on the mondayUser data
			const authStartTime = Date.now();
			const response = await fetch("/api/auth/monday-user", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"monday-context": JSON.stringify(contextResult),
				},
				body: JSON.stringify({
					mondayUserId: mondayUser.id,
					mondayAccountId: mondayUser.accountId,
					email: mondayUser.email,
					name: mondayUser.name,
				}),
			});

			if (!response.ok) {
				throw new Error("Failed to authenticate user");
			}

			const { userProfile } = await response.json();

			// Update user store with Supabase user
			useUserStore.setState({
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

		monday.listen("context", (res: any) => {
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
