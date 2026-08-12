import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import type { TimerStore } from "@/types/timer.types";

/** Initial state, also re-applied by `reset()`. */
const initialState = {
	/** Active (non-finalized) `time_entry` id backing the live timer, or null when idle. */
	entryId: null as string | null,
	/** Elapsed run time in milliseconds (server-derived). */
	elapsedTime: 0,
	/** ISO start time of the active timer. */
	startTime: null as string | null,
	/** Timer lifecycle: idle / running / paused. */
	status: "idle" as TimerStore["status"],

	comment: "",

	isSaving: false,
	isLoading: false,
	error: null as string | null,

	/** Baseline for computing elapsed time locally between server syncs. */
	_serverSync: null as TimerStore["_serverSync"],
};

/**
 * Timer state for the active timer: the entry id, elapsed time, status, and the
 * in-progress comment. A pure state container with simple setters — no API calls
 * live here; the orchestration that drives them is in the `useTimer` hook
 * (`components/features/timer/hooks/useTimer.ts`).
 *
 * In the 2-table model a live timer **is** a non-finalized `time_entry`, so the
 * only id we track is `entryId` (no more `sessionId`). Only what is needed to
 * recover the active timer across reloads is persisted to localStorage:
 * `entryId` and `comment`. The comment is also auto-saved to the DB (debounced,
 * via `PATCH /api/timer/comment` from `useTimer`); localStorage just covers fast
 * reloads before that round-trips.
 */
export const useTimerStore = create<TimerStore>()(
	persist(
		(set, get) => ({
			...initialState,

			/**
			 * Bind the active timer from an API/RPC payload; pass `null` to clear it.
			 * Maps the DB `timer_state` to the widget status (`running` stays
			 * running; anything else the widget tracks is shown as `paused`).
			 */
			setActiveTimer: (timer) => {
				if (timer === null) {
					set({
						entryId: null,
						startTime: null,
						status: "idle",
					});
					return;
				}

				set({
					entryId: timer.id ?? get().entryId,
					startTime: timer.start_time ?? get().startTime,
					status: timer.timer_state === "running" ? "running" : "paused",
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
				// Only persist what is needed to recover the active timer across reloads.
				comment: state.comment,
				entryId: state.entryId,
				// Don't persist: elapsedTime (fetched from server), status, UI states, _serverSync
			}),
		},
	),
);

// Selector hooks — narrow slices using useShallow to avoid re-render loops on object results.

/** Active-timer slice (entry id, start, status). Shallow-compared. */
export function useTimerSession() {
	return useTimerStore(
		useShallow((state) => ({
			entryId: state.entryId,
			startTime: state.startTime,
			status: state.status,
		})),
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
		})),
	);
}

/** Derived booleans (isActive, hasSession, canSave, isPaused). Shallow-compared. */
export function useTimerComputed() {
	return useTimerStore(
		useShallow((state) => ({
			isActive: state.status === "running",
			hasSession: state.entryId !== null,
			canSave: state.entryId !== null && !state.isSaving,
			isPaused: state.status === "paused",
		})),
	);
}
