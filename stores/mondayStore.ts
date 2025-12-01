// stores/mondayStore.ts
import { create } from "zustand";
import mondaySdk from "monday-sdk-js";
import { useUserStore } from "./userStore";

const monday = mondaySdk();

interface MondayState {
	rawContext: any;
	isLoading: boolean;
	error: string | null;

	initializeMondayContext: () => Promise<void>;
	setRawContext: (context: any) => void;
	setLoading: (loading: boolean) => void;
	setError: (error: string | null) => void;
}

export const useMondayStore = create<MondayState>()((set, get) => ({
	rawContext: null,
	isLoading: true,
	error: null,

	initializeMondayContext: async () => {
		const startTime = Date.now();
		try {
			set({ isLoading: true, error: null });

			// OPTIMIZATION: Fetch context and user data in PARALLEL
			// This reduces initialization time by ~30-50%
			const [contextResult, userResult] = await Promise.all([monday.get("context"), monday.api(`query { me { id name email } }`)]);

			console.log(`[initializeMondayContext] Parallel fetch complete - ${Date.now() - startTime}ms`);

			if (!contextResult?.data?.user) {
				throw new Error("No user found in Monday.com context");
			}

			set({ rawContext: contextResult });
			console.log("Monday context data:", contextResult);

			// Update user store with Monday user info
			const mondayUser = {
				id: contextResult.data.user.id,
				accountId: contextResult.data.account.id,
				email: userResult?.data?.me?.email || null,
				name: userResult?.data?.me?.name || null,
				isAdmin: contextResult.data.user.isAdmin || false,
				isGuest: contextResult.data.user.isGuest || false,
				isViewOnly: contextResult.data.user.isViewOnly || false,
				countryCode: contextResult.data.user.countryCode || "",
				currentLanguage: contextResult.data.user.currentLanguage || "",
				timeFormat: contextResult.data.user.timeFormat || "24H",
				timeZoneOffset: contextResult.data.user.timeZoneOffset || 0,
			};

			useUserStore.setState({ mondayUser });
			console.log("Monday user set in user store:", mondayUser);

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

			console.log(`[initializeMondayContext] Auth API call - ${Date.now() - authStartTime}ms`);

			if (!response.ok) {
				throw new Error("Failed to authenticate user");
			}

			const { userProfile } = await response.json();

			// Update user store with Supabase user
			useUserStore.setState({
				supabaseUser: userProfile,
				authenticated: true,
			});

			console.log("Supabase user initialized:", userProfile);
			console.log(`[initializeMondayContext] Total initialization time - ${Date.now() - startTime}ms`);

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
}));
