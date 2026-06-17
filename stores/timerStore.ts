import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { TimerStore, TimerStatus, ServerSyncRef } from "@/types/timer.types";

/** Initial state, also re-applied by `reset()`. */
const initialState = {
	/** Active `timer_session` id, or null when idle. */
	sessionId: null as string | null,
	/** Draft `time_entry` id backing the running timer. */
	draftId: null as string | null,
	/** Elapsed run time in milliseconds (server-derived). */
	elapsedTime: 0,
	/** ISO start time of the current run segment. */
	startTime: null as string | null,
	/** Timer lifecycle: idle / running / paused. */
	status: "idle" as TimerStatus,

	comment: "",

	isSaving: false,
	isLoading: false,
	error: null as string | null,

	/** Baseline for computing elapsed time locally between server syncs. */
	_serverSync: null as ServerSyncRef | null,
};

/**
 * Timer state for the active session: ids, elapsed time, status, and the
 * in-progress comment. A pure state container with simple setters — no API calls
 * live here; the orchestration that drives them is in the `useTimer` hook
 * (`components/features/timer/hooks/useTimer.ts`). Only the data needed to recover
 * a session across reloads (`comment`, `draftId`, `sessionId`) is persisted to
 * localStorage.
 */
export const useTimerStore = create<TimerStore>()(
	persist(
		(set, get) => ({
			...initialState,

			/** Apply session data from an API response; pass `null` to clear the session. */
			setSession: (session) => {
				if (session === null) {
					set({
						sessionId: null,
						draftId: null,
						startTime: null,
						status: "idle",
					});
					return;
				}

				set({
					sessionId: session.id ?? get().sessionId,
					draftId: session.draft_id ?? get().draftId,
					startTime: session.start_time ?? get().startTime,
					status: session.is_paused !== undefined ? (session.is_paused ? "paused" : "running") : get().status,
				});
			},

			/** Set the timer status (idle / running / paused). */
			setStatus: (status) => {
				set({ status });
			},

			/** Set elapsed time, in milliseconds. */
			setElapsedTime: (elapsedTime) => {
				set({ elapsedTime });
			},

			/** Record a server-provided elapsed-time baseline used to tick locally. */
			updateServerSync: (baseTime) => {
				set({
					_serverSync: {
						baseElapsedTime: baseTime,
						syncedAt: Date.now(),
					},
				});
			},

			/** Drop the server sync baseline. */
			clearServerSync: () => {
				set({ _serverSync: null });
			},

			/** Update the comment text. */
			setComment: (comment) => {
				set({ comment });
			},

			/** Clear the comment. */
			clearComment: () => {
				set({ comment: "" });
			},

			/** Set the saving flag. */
			setSaving: (isSaving) => {
				set({ isSaving });
			},

			/** Set the loading flag. */
			setLoading: (isLoading) => {
				set({ isLoading });
			},

			/** Set the error message (or null). */
			setError: (error) => {
				set({ error });
			},

			/** Reset all state back to initial values. */
			reset: () => {
				set({
					...initialState,
				});
			},
		}),
		{
			name: "timer-store",
			skipHydration: true, // Important for Next.js SSR
			partialize: (state) => ({
				// Only persist essential data for session recovery
				comment: state.comment,
				draftId: state.draftId,
				sessionId: state.sessionId,
				// Don't persist: elapsedTime (fetched from server), status, UI states, _serverSync
			}),
		}
	)
);

// Selector hooks — narrow slices using useShallow to avoid re-render loops on object results.

/** Session-related slice (id, draft, start, status). Shallow-compared. */
export function useTimerSession() {
	return useTimerStore(
		useShallow((state) => ({
			sessionId: state.sessionId,
			draftId: state.draftId,
			startTime: state.startTime,
			status: state.status,
		}))
	);
}

/** Elapsed time only. */
export function useTimerElapsed() {
	return useTimerStore((state) => state.elapsedTime);
}

/** Comment only. */
export function useTimerComment() {
	return useTimerStore((state) => state.comment);
}

/** UI flags (saving, loading, error). Shallow-compared. */
export function useTimerUIState() {
	return useTimerStore(
		useShallow((state) => ({
			isSaving: state.isSaving,
			isLoading: state.isLoading,
			error: state.error,
		}))
	);
}

/** Derived booleans (isActive, hasSession, canSave, isPaused). Shallow-compared. */
export function useTimerComputed() {
	return useTimerStore(
		useShallow((state) => ({
			isActive: state.status === "running",
			hasSession: state.sessionId !== null,
			canSave: state.sessionId !== null && !state.isSaving,
			isPaused: state.status === "paused",
		}))
	);
}
