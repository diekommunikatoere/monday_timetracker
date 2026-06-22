// components/shared/hooks/useTimer.ts
import { useEffect, useMemo } from "react";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import { useModalStore } from "@/stores/modalStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { supabase } from "@/lib/supabase/client";
import { UseTimerReturn } from "@/types/timer.types";
import { TimerSession } from "@/types/database";

/**
 * Aggregates timer state + actions for the current user.
 *
 * Pulls reactive state from {@link useTimerStore}, the current user's identity
 * from {@link useUserStore} (`supabaseUser`), and sets up a **realtime Supabase
 * subscription** on the `public.timer_session` table that pushes incoming
 * `TimerSession` rows back into the store via `setSession` — but **only** when
 * the payload's `user_id` matches the current user (per-row ownership filter on
 * top of RLS). The subscription is torn down on unmount / when the user changes.
 *
 * The `actions` object wires cross-store side effects: `reset` clears the
 * timer store and refetches the user's entries from {@link useTimeEntriesStore},
 * `openSaveModal` opens the save dialog via {@link useModalStore}
 * (`openTimerSave`), and `updateComment` writes through to the store. Several
 * actions (`start`, `pause`, `resume`, `saveAsDraft`, `confirmSaveAsDraft`) are
 * currently **stubs** awaiting feature-hook logic (see `TODO` in
 * `confirmSaveAsDraft`) — wire them up before relying on them.
 *
 * @returns A {@link UseTimerReturn}: `state` (raw {@link TimerState}),
 *   `actions` (memoized {@link TimerActions}), and computed booleans
 *   `isActive` (`status === "running"`), `hasSession` (`sessionId !== null`),
 *   `canSave` (`hasSession && !isSaving`).
 */
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
			.on<TimerSession>("postgres_changes", { event: "*", schema: "public", table: "timer_session" }, (payload) => {
				// Use a type guard or safe property access for payload.new
				const newSession = payload.new as TimerSession;
				if (newSession && "user_id" in newSession && newSession.user_id === userProfile.id) {
					storeActions.setSession(newSession as any);
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
			resume: async () => {},
			reset: async () => {
				storeActions.reset();
				// Trigger the save modal
				if (userProfile.id) {
					useTimeEntriesStore.getState().refetch(userProfile.id);
				}
			},
			saveAsDraft: async () => {},
			confirmSaveAsDraft: async () => {
				// TODO: Implement logic from feature hook
			},
			openSaveModal: () => {
				// Trigger the save modal
				useModalStore.getState().openTimerSave();
			},
			updateComment: (comment: string) => {
				storeActions.setComment(comment);
			},
		}),
		[storeActions, userProfile.id],
	);

	/* Computed properties */
	return {
		state,
		actions,
		isActive: state.status === "running",
		hasSession: !!state.sessionId,
		canSave: !!state.sessionId && !state.isSaving,
	};
}
