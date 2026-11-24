// components/sidebar/hooks/useLiveItemTimeEntries.ts
"use client";

import { useEffect, useRef } from "react";

import { supabase } from "@/lib/supabase/client";
import { useEditPresenceStore } from "@/stores/editPresenceStore";
import { useItemTimeEntriesStore } from "@/stores/itemTimeEntriesStore";

const DEBOUNCE_MS = 750;

function isFinalizedOrParked(timerState: unknown): boolean {
	return timerState === "finalized" || timerState === "parked";
}

/**
 * Keeps the sidebar's `itemTimeEntriesStore` up to date via Supabase Realtime
 * (`postgres_changes` on `time_entry` for both `item_id=eq.${itemId}` and
 * `parent_item_id=eq.${itemId}`) and on `visibilitychange` -> `visible`.
 *
 * Defers refetches while a local modal is open (`editPresenceStore.isLocalEditing`)
 * and runs one background refetch once the edit ends.
 */
export function useLiveItemTimeEntries(itemId: string | null | undefined) {
	const isLocalEditing = useEditPresenceStore((state) => state.isLocalEditing);

	const pendingRef = useRef(false);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!itemId) return;

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
				void useItemTimeEntriesStore.getState().refetch();
				return;
			}

			debounceTimerRef.current = setTimeout(() => {
				debounceTimerRef.current = null;
				if (useEditPresenceStore.getState().isLocalEditing) {
					pendingRef.current = true;
					return;
				}
				pendingRef.current = false;
				void useItemTimeEntriesStore.getState().refetch();
			}, DEBOUNCE_MS);
		};

		const handleChange = (payload: { new: unknown; old: unknown }) => {
			const newState = (payload.new as { timer_state?: unknown } | null)?.timer_state;
			const oldState = (payload.old as { timer_state?: unknown } | null)?.timer_state;
			if (!isFinalizedOrParked(newState) && !isFinalizedOrParked(oldState)) {
				return;
			}
			triggerOrDefer(false);
		};

		const channel = supabase
			.channel(`sidebar-item-entries-${itemId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "time_entry",
					filter: `item_id=eq.${itemId}`,
				},
				handleChange,
			)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "time_entry",
					filter: `parent_item_id=eq.${itemId}`,
				},
				handleChange,
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
	}, [itemId]);

	useEffect(() => {
		if (isLocalEditing || !pendingRef.current || !itemId) return;
		pendingRef.current = false;
		if (useItemTimeEntriesStore.getState().refreshing) return;
		void useItemTimeEntriesStore.getState().refetch();
	}, [isLocalEditing, itemId]);
}
