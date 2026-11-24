// components/dashboard/hooks/useLiveTimeEntries.ts
"use client";

import { useEffect, useRef } from "react";

import { supabase } from "@/lib/supabase/client";
import { useEditPresenceStore } from "@/stores/editPresenceStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useUserStore } from "@/stores/userStore";

const DEBOUNCE_MS = 750;

function isFinalizedOrParked(timerState: unknown): boolean {
	return timerState === "finalized" || timerState === "parked";
}

/**
 * Keeps the dashboard's `timeEntriesStore` up to date via Supabase Realtime
 * (`postgres_changes` on `time_entry` filtered to the current user) and on
 * `visibilitychange` -> `visible`.
 *
 * Ignores `running`/`paused` timer churn and comment auto-saves. While a local
 * edit modal is open (`editPresenceStore.isLocalEditing`), refetches are
 * deferred (`pendingRef`) and collapsed into a single background refetch once
 * editing ends.
 */
export function useLiveTimeEntries() {
	const profileId = useUserStore((state) => state.supabaseUser?.id ?? null);
	const isLocalEditing = useEditPresenceStore((state) => state.isLocalEditing);

	const pendingRef = useRef(false);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!profileId) return;

		const clearDebounce = () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}
		};

		const triggerOrDefer = (immediate = false) => {
			if (useEditPresenceStore.getState().isLocalEditing) {
				clearDebounce();
				pendingRef.current = true;
				return;
			}

			clearDebounce();
			if (immediate) {
				pendingRef.current = false;
				void useTimeEntriesStore.getState().refetch(profileId);
				return;
			}

			debounceTimerRef.current = setTimeout(() => {
				debounceTimerRef.current = null;
				if (useEditPresenceStore.getState().isLocalEditing) {
					pendingRef.current = true;
					return;
				}
				pendingRef.current = false;
				void useTimeEntriesStore.getState().refetch(profileId);
			}, DEBOUNCE_MS);
		};

		const channel = supabase
			.channel(`dashboard-entries-${profileId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "time_entry",
					filter: `user_id=eq.${profileId}`,
				},
				(payload) => {
					const newState = (payload.new as { timer_state?: unknown } | null)?.timer_state;
					const oldState = (payload.old as { timer_state?: unknown } | null)?.timer_state;
					if (!isFinalizedOrParked(newState) && !isFinalizedOrParked(oldState)) {
						return;
					}
					triggerOrDefer(false);
				},
			)
			.subscribe();

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				triggerOrDefer(true);
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			clearDebounce();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			void supabase.removeChannel(channel);
		};
	}, [profileId]);

	// Flush deferred refetch once the local edit modal closes.
	useEffect(() => {
		if (isLocalEditing || !pendingRef.current || !profileId) return;
		pendingRef.current = false;
		// Skip if the modal's own save handler just kicked off a refetch in the same tick.
		if (useTimeEntriesStore.getState().refreshing) return;
		void useTimeEntriesStore.getState().refetch(profileId);
	}, [isLocalEditing, profileId]);
}
