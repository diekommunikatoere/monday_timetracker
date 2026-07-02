// components/features/timer/hooks/useTimer.ts
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Database } from "@/types/database";
import type { UseTimerReturn, TimerActions, TimerState, ActiveTimer, ActiveTimersResponse } from "@/types/timer.types";
import { supabase } from "@/lib/supabase/client";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useModalStore } from "@/stores/modalStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useHydration } from "@/lib/store-utils";

type TimeEntryRow = Database["public"]["Tables"]["time_entry"]["Row"];

/**
 * Pick the timer the live widget should track from the user's active set.
 *
 * `get_active_timers` returns every non-finalized entry (running / paused /
 * parked). The single-timer widget tracks the `running` one if present, else the
 * most recently updated `paused` one (the RPC orders by `updated_at DESC`).
 * `parked` ("saved as draft") entries are surfaced in the entries table, not here.
 */
function pickActiveTimer(timers: ActiveTimer[]): ActiveTimer | null {
	return timers.find((t) => t.timer_state === "running") ?? timers.find((t) => t.timer_state === "paused") ?? null;
}

/**
 * `useTimer` — unified hook that owns **all** timer logic for the feature.
 *
 * 2-table model (see docs/timer-redesign.md): a live timer **is** a non-finalized
 * `time_entry`, identified by `entryId` (there is no `timer_session`/`sessionId`).
 * Each transition is a single atomic RPC behind a thin route. This hook:
 *  - Loads the user's active timer on mount via `GET /api/timer`
 *    (`get_active_timers`), choosing one with {@link pickActiveTimer}.
 *  - Subscribes to Supabase realtime on the `time_entry` table (filtered to the
 *    current user) and re-fetches authoritative state on any change, for
 *    cross-device sync. NOTE: this lights up once migration 028 adds `time_entry`
 *    to the `supabase_realtime` publication; until then it is a harmless no-op and
 *    the per-action refetch keeps the acting device correct.
 *  - Runs a 1-second tick that recomputes elapsed time locally as
 *    `baseElapsedTime + (Date.now() - syncedAt)` (all values in **milliseconds**;
 *    the RPC reports `elapsed_seconds`, converted to ms here).
 *  - Wraps every timer API call (`start`/`pause`/`resume`/`park`/`reset`) with a
 *    `Bearer sessionToken` auth header and a JSON body.
 *  - Auto-saves the comment (debounced 500 ms) onto the active entry via
 *    `PATCH /api/timer/comment`.
 *
 * The comment is also persisted to localStorage by the store (fast reloads) and is
 * written on **park** (save as draft → `/api/timer/park`) and **finalize** (the
 * Save modal); the debounced auto-save covers durability + cross-device sync in
 * between.
 *
 * While the store has not hydrated yet it returns a safe loading placeholder.
 *
 * @returns A {@link UseTimerReturn}: `{ state, isActive, hasSession, canSave, actions }`.
 */
export function useTimer(): UseTimerReturn {
	const hydrated = useHydration();

	// Store selectors (reactive)
	const entryId = useTimerStore((s) => s.entryId);
	const elapsedTime = useTimerStore((s) => s.elapsedTime);
	const startTime = useTimerStore((s) => s.startTime);
	const status = useTimerStore((s) => s.status);
	const comment = useTimerStore((s) => s.comment);
	const isSaving = useTimerStore((s) => s.isSaving);
	const isLoading = useTimerStore((s) => s.isLoading);
	const error = useTimerStore((s) => s.error);
	const _serverSync = useTimerStore((s) => s._serverSync);

	// Store actions (stable references)
	const store = useTimerStore.getState();

	// User profile
	const userProfile = useUserStore((s) => s.supabaseUser);

	// Modal store for save / empty-comment flows
	const { openTimerSave, openEmptyCommentConfirmation, closeEmptyCommentConfirmation } = useModalStore();

	// Time entries for refetch after park
	const { refetch: refetchTimeEntries } = useTimeEntriesStore();

	// Local error state for hook-level errors
	const [hookError, setHookError] = useState<string | null>(null);

	// The comment value we last know to be persisted (via our own auto-save PATCH or
	// adopted from a server fetch). The local comment is "dirty" — has unsaved edits we
	// must not clobber on a realtime refetch — when it differs from this.
	const lastSavedCommentRef = useRef<string | null>(null);

	// Monday session token (the JWT the server verifies)
	const { sessionToken } = useMondayStore();

	// ============================================
	// Helper Functions
	// ============================================

	/** JSON API call with the bearer session token. */
	const apiCall = useCallback(
		async <T>(url: string, options: RequestInit = {}): Promise<T> => {
			if (!sessionToken) {
				console.warn(`[TimerHook] Skipping API call to ${url} because sessionToken is missing`);
				throw new Error("Session token not available. Please wait for initialization.");
			}

			const response = await fetch(url, {
				...options,
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
					...options.headers,
				},
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `API call failed: ${response.status}`);
			}

			return response.json().catch(() => ({}) as T);
		},
		[sessionToken],
	);

	/** Fetch the authoritative active timer and sync the store to it. */
	const loadActiveTimer = useCallback(async () => {
		const data = await apiCall<ActiveTimersResponse>("/api/timer");
		const active = pickActiveTimer(data.timers ?? []);

		if (!active) {
			store.reset();
			return;
		}

		store.setActiveTimer(active);

		const elapsedMs = active.elapsed_seconds * 1000;
		store.setElapsedTime(elapsedMs);
		store.updateServerSync(elapsedMs);

		// Adopt the server comment as the source of truth — including an empty value, so
		// a clear made on another device propagates here — UNLESS the local comment has
		// unsaved edits (differs from what we last persisted), which we must not clobber
		// while the user is mid-typing.
		const serverComment = active.comment ?? "";
		const localComment = useTimerStore.getState().comment;
		const hasUnsavedEdits = lastSavedCommentRef.current !== null && localComment !== lastSavedCommentRef.current;
		if (!hasUnsavedEdits) {
			if (serverComment !== localComment) store.setComment(serverComment);
			lastSavedCommentRef.current = serverComment;
		}
	}, [apiCall]);

	// ============================================
	// Initial Load
	// ============================================

	useEffect(() => {
		if (!hydrated || !userProfile) {
			store.setLoading(false);
			return;
		}

		let cancelled = false;

		const run = async () => {
			try {
				store.setLoading(true);
				store.setError(null);
				await loadActiveTimer();
			} catch (err: any) {
				if (cancelled) return;
				console.error("Failed to load active timer:", err);
				store.setError(err.message || "Failed to load timer");
				setHookError(err.message);
			} finally {
				if (!cancelled) store.setLoading(false);
			}
		};

		run();
		return () => {
			cancelled = true;
		};
	}, [hydrated, userProfile, loadActiveTimer]);

	// ============================================
	// Real-time Subscription (cross-device sync)
	// ============================================

	useEffect(() => {
		if (!hydrated || !userProfile) return;

		let debounceTimeout: NodeJS.Timeout | null = null;

		const channel = supabase
			.channel("timer-entry-updates")
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "time_entry",
					filter: `user_id=eq.${userProfile.id}`,
				},
				() => {
					// Any change to the user's entries → re-fetch the authoritative active timer.
					if (debounceTimeout) clearTimeout(debounceTimeout);
					debounceTimeout = setTimeout(() => {
						loadActiveTimer().catch((err) => console.error("Realtime timer reload failed:", err));
					}, 250);
				},
			)
			.subscribe();

		return () => {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			supabase.removeChannel(channel);
		};
	}, [hydrated, userProfile, loadActiveTimer]);

	// ============================================
	// Timer Interval (local tick while running)
	// ============================================

	useEffect(() => {
		if (!hydrated) return;

		let interval: NodeJS.Timeout | undefined;
		const sync = _serverSync;

		if (entryId && status === "running" && sync) {
			interval = setInterval(() => {
				const localTimeSinceSync = Date.now() - sync.syncedAt;
				store.setElapsedTime(sync.baseElapsedTime + localTimeSinceSync);
			}, 1000);
		}

		return () => {
			if (interval) clearInterval(interval);
		};
	}, [hydrated, entryId, status, _serverSync]);

	// ============================================
	// Comment Auto-save (debounced)
	// ============================================

	useEffect(() => {
		// A live timer is a non-finalized time_entry, so the comment auto-saves
		// straight onto it (PATCH /api/timer/comment), debounced 500 ms. localStorage
		// (via the store) covers fast reloads; this covers durability + cross-device.
		if (!hydrated || !entryId) return;
		// Nothing to do if the comment already matches what we last persisted (avoids a
		// redundant write right after adopting the server value on load).
		if (comment === lastSavedCommentRef.current) return;

		const handle = setTimeout(() => {
			const sent = comment;
			apiCall("/api/timer/comment", {
				method: "PATCH",
				body: JSON.stringify({ entryId, comment: sent }),
			})
				.then(() => {
					lastSavedCommentRef.current = sent;
				})
				.catch((err) => console.error("Failed to auto-save comment:", err));
		}, 500);

		return () => clearTimeout(handle);
	}, [hydrated, entryId, comment, apiCall]);

	// ============================================
	// Core Actions (Internal)
	// ============================================

	/** Park the active timer ("save as draft") and clear local timer state. */
	const performPark = useCallback(async () => {
		if (!entryId) return;

		try {
			store.setSaving(true);
			store.setError(null);

			await apiCall("/api/timer/park", {
				method: "POST",
				body: JSON.stringify({ entryId, entryComment: comment }),
			});

			store.reset();

			if (userProfile?.id) refetchTimeEntries(userProfile.id);
		} catch (err: any) {
			console.error("Failed to save timer as draft:", err);
			store.setError(err.message || "Failed to save as draft");
			setHookError(err.message);
		} finally {
			store.setSaving(false);
		}
	}, [entryId, comment, userProfile?.id, apiCall, refetchTimeEntries]);

	// ============================================
	// Timer Actions
	// ============================================

	const actions: TimerActions = useMemo(
		() => ({
			/** Start a brand-new running timer. */
			start: async () => {
				try {
					store.setError(null);

					const data = await apiCall<{ entry: TimeEntryRow }>("/api/timer/start", {
						method: "POST",
						body: JSON.stringify({}),
					});

					// Fresh timer: clear any stale comment, bind the new entry, reset elapsed.
					store.setComment("");
					store.setActiveTimer(data.entry);
					store.setElapsedTime(0);
					store.updateServerSync(0);
				} catch (err: any) {
					console.error("Failed to start timer:", err);
					store.setError(err.message || "Failed to start timer");
					setHookError(err.message);

					// The interim single-timer guard (migration 027) refuses to start a second
					// timer and returns 409 with a German message (already captured above). Re-sync
					// to whatever timer actually exists server-side so the UI adopts it instead of
					// staying idle/out of sync.
					loadActiveTimer().catch(() => {});
				}
			},

			/** Pause the running timer. */
			pause: async () => {
				if (!entryId) return;

				try {
					store.setError(null);

					// Freeze elapsed precisely at the pause instant, then stop the tick.
					const sync = useTimerStore.getState()._serverSync;
					const frozen = sync ? sync.baseElapsedTime + (Date.now() - sync.syncedAt) : useTimerStore.getState().elapsedTime;

					await apiCall("/api/timer/pause", {
						method: "POST",
						body: JSON.stringify({ entryId }),
					});

					store.setElapsedTime(frozen);
					store.updateServerSync(frozen);
					store.setStatus("paused");
				} catch (err: any) {
					console.error("Failed to pause timer:", err);
					store.setError(err.message || "Failed to pause timer");
					setHookError(err.message);
				}
			},

			/** Resume a paused timer. */
			resume: async () => {
				if (!entryId) return;

				try {
					store.setError(null);

					await apiCall("/api/timer/resume", {
						method: "POST",
						body: JSON.stringify({ entryId }),
					});

					// A new segment starts now; continue ticking from the current elapsed.
					store.updateServerSync(useTimerStore.getState().elapsedTime);
					store.setStatus("running");
				} catch (err: any) {
					console.error("Failed to resume timer:", err);
					store.setError(err.message || "Failed to resume timer");
					setHookError(err.message);
				}
			},

			/** Reset (discard) the active timer; deletes the entry and its segments. */
			reset: async () => {
				if (!entryId) return;

				const id = entryId;

				try {
					// setSaving guards against a rapid double-click firing a second reset for the
					// same entry (timer_reset is non-idempotent — it raises on 0 rows deleted). It
					// also disables the button via the existing `disabled={!hasSession || isSaving}`
					// wiring for the whole in-flight window.
					store.setSaving(true);
					store.setError(null);

					await apiCall("/api/timer/reset", {
						method: "POST",
						body: JSON.stringify({ entryId: id }),
					});

					store.reset();
				} catch (err: any) {
					console.error("Failed to reset timer:", err);
					store.setError(err.message || "Failed to reset timer");
					setHookError(err.message);
				} finally {
					store.setSaving(false);
				}
			},

			/** Save as draft (park). Prompts first when the comment is empty. */
			saveAsDraft: async () => {
				if (!comment || comment.trim() === "") {
					openEmptyCommentConfirmation();
					return;
				}
				await performPark();
			},

			/** Confirm save as draft (bypasses the empty-comment prompt). */
			confirmSaveAsDraft: async () => {
				closeEmptyCommentConfirmation();
				await performPark();
			},

			/** Open the save modal (pause first if running). */
			openSaveModal: () => {
				if (status === "running") {
					actions.pause();
				}
				openTimerSave();
			},

			/** Update the in-progress comment. */
			updateComment: (newComment: string) => {
				store.setComment(newComment);
			},
		}),
		[entryId, comment, status, apiCall, loadActiveTimer, openTimerSave, openEmptyCommentConfirmation, closeEmptyCommentConfirmation, performPark],
	);

	// ============================================
	// Build State Object
	// ============================================

	const state: TimerState = useMemo(
		() => ({
			entryId,
			elapsedTime,
			startTime,
			status,
			comment,
			isSaving,
			isLoading,
			error: error || hookError,
			_serverSync,
		}),
		[entryId, elapsedTime, startTime, status, comment, isSaving, isLoading, error, hookError, _serverSync],
	);

	// ============================================
	// Computed Values
	// ============================================

	const isActive = status === "running";
	const hasSession = entryId !== null;
	const canSave = hasSession && !isSaving;

	// Return loading state if not hydrated
	if (!hydrated) {
		return {
			state: {
				entryId: null,
				elapsedTime: 0,
				startTime: null,
				status: "idle",
				comment: "",
				isSaving: false,
				isLoading: true,
				error: null,
				_serverSync: null,
			},
			isActive: false,
			hasSession: false,
			canSave: false,
			actions,
		};
	}

	return {
		state,
		isActive,
		hasSession,
		canSave,
		actions,
	};
}

/**
 * Legacy alias for backwards compatibility
 * @deprecated Use useTimer instead
 */
export const useTimerStateSSR = useTimer;
