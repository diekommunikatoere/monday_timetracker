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
		try {
			set({ isLoading: true, error: null });

			// Get current user from Monday.com SDK
			const context = await monday.get("context");
			const user = await monday.api(`query { me { id name email } }`);

			if (!context?.data.user) {
				throw new Error("No user found in Monday.com context");
			}

			set({ rawContext: context });
			console.log("Monday context data:", context);

			// Update user store with Monday user info
			const mondayUser = {
				id: context.data.user.id,
				accountId: context.data.account.id,
				email: user?.data?.me?.email || null,
				name: user?.data?.me?.name || null,
				isAdmin: context.data.user.isAdmin || false,
				isGuest: context.data.user.isGuest || false,
				isViewOnly: context.data.user.isViewOnly || false,
				countryCode: context.data.user.countryCode || "",
				currentLanguage: context.data.user.currentLanguage || "",
				timeFormat: context.data.user.timeFormat || "24H",
				timeZoneOffset: context.data.user.timeZoneOffset || 0,
			};

			useUserStore.setState({ mondayUser });
			console.log("Monday user set in user store:", mondayUser);

			// Authenticate user through API route (creates/finds Supabase user)
			const response = await fetch("/api/auth/monday-user", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"monday-context": JSON.stringify(context),
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

			console.log("Supabase user initialized:", userProfile);

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
