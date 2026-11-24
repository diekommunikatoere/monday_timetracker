// components/shared/EditPresenceProvider.tsx
"use client";

import { useEffect } from "react";

import { useEditPresenceStore } from "@/stores/editPresenceStore";
import { useUserStore } from "@/stores/userStore";

/**
 * Connects the account-scoped Supabase Realtime Presence channel for soft
 * time-entry edit locks once `userStore` has populated the user's profile.
 *
 * Mounted at the root layout alongside `TimerProvider` so dashboard, sidebar,
 * and admin iframes all participate in the same `entry-edits:${accountId}` room.
 */
export function EditPresenceProvider({ children }: { children: React.ReactNode }) {
	const profileId = useUserStore((state) => state.supabaseUser?.id ?? null);
	const accountId = useUserStore((state) => state.supabaseUser?.monday_account_id || state.mondayUser?.accountId || null);
	const userName = useUserStore((state) => state.supabaseUser?.name || state.mondayUser?.name || "Unbekannter Benutzer");

	useEffect(() => {
		if (!accountId || !profileId) return;
		useEditPresenceStore.getState().connect(accountId, profileId, userName);
	}, [accountId, profileId, userName]);

	useEffect(() => {
		return () => {
			useEditPresenceStore.getState().disconnect();
		};
	}, []);

	return <>{children}</>;
}
