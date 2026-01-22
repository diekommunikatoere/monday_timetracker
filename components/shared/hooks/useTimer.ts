// components/shared/hooks/useTimer.ts
import { useEffect, useCallback, useMemo } from "react";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import { useModalStore } from "@/stores/modalStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { supabase } from "@/lib/supabase/client";
import { UseTimerReturn } from "@/types/timer.types";

export function useTimer(): UseTimerReturn {
	/* Reactive state selectors */
	// Core timer state
	const state = useTimerStore();

	// User identity
	const userProfile = useUserStore((s) => s.supabaseUser);

	// Store actions
	const storeActions = useTimerStore.getState();

	/* Real-time Supabase sync */
	useEffect(() => {
		if (!userProfile.id) return;

		const channel = supabase
			.channel("timer_updates")
			.on("postgres_changes", { event: "*", schema: "public", table: "timer_session" }, (payload) => {
				if (payload.new?.user_id === userProfile.id) {
					storeActions.setSession(payload.new);
				}
			})
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [userProfile?.id]);

	/* Core Actions (cross-store) */
	const actions = useMemo(
		() => ({
			start: async () => {},
			pause: async () => {},
			stop: async () => {
				// Trigger the save modal
				useModalStore.getState().openTimerSave();
			},
			reset: async () => {
				storeActions.reset();
				// Trigger the save modal
				useTimeEntriesStore.getState().refetch(userProfile.id);
			},
		}),
		[storeActions]
	);

	/* Computed properties */
	return {
		state,
		actions,
		isActive: state.status === "running",
		hasSession: !!state.sessionId,
	};
}
