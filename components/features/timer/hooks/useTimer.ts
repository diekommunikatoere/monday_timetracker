// components/features/timer/hooks/useTimer.ts
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import mondaySdk from "monday-sdk-js";
import type { Database, GetCurrentElapsedTimeResult } from "@/types/database";
import type { UseTimerReturn, TimerActions, TimerState, TimerStatus } from "@/types/timer.types";
import { supabase } from "@/lib/supabase/client";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import { useMondayStore } from "@/stores/mondayStore";
import { useDraftStore } from "@/stores/draftStore";
import { useModalStore } from "@/stores/modalStore";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useHydration } from "@/lib/store-utils";

const monday = mondaySdk();

type TimerSession = Database["public"]["Tables"]["timer_session"]["Row"];

interface RealTimeTimerSessionPayload {
	schema: "public";
	table: "timer_session";
	commit_timestamp: string;
	eventType: "INSERT" | "UPDATE" | "DELETE";
	new: TimerSession | null;
	old: TimerSession | null;
	errors: string[] | null;
	latency: number;
}

/**
 * `useTimer` — unified hook that owns **all** timer logic for the feature.
 *
 * Centralises everything the timer UI needs so components never touch the
 * underlying stores directly:
 *  - Loads the user's active session on mount (via `/api/timer/session`).
 *  - Subscribes to Supabase realtime on the `timer_session` table for
 *    cross-device sync, filtering to the current user and debouncing updates by
 *    200 ms. While running it re-fetches authoritative elapsed time through the
 *    `get_current_elapsed_time` RPC to avoid clock drift.
 *  - Runs a 1-second `setInterval` tick that recomputes elapsed time locally as
 *    `baseElapsedTime + (Date.now() - syncedAt)` (all values in **milliseconds**).
 *  - Debounces comment auto-save (500 ms) via `useDraftStore.autoSaveDraft`.
 *  - Wraps all timer API calls (`start`/`pause`/`resume`/`reset`/`soft-reset`)
 *    with monday `rawContext` + `Bearer sessionToken` auth headers.
 *
 * While the store has not hydrated yet it returns a safe loading placeholder
 * (`isLoading: true`, `sessionId: null`, no actions wired). Reads from
 * `useTimerStore` (reactive state + `getState()` actions), `useUserStore`,
 * `useMondayStore`, `useDraftStore`, `useModalStore`, and `useTimeEntriesStore`.
 *
 * Exposed to the tree by {@link TimerProvider} and consumed via
 * `useTimerContext` ({@link TimerContainer} etc.).
 *
 * @returns A {@link UseTimerReturn}: `{ state, isActive, hasSession, canSave, actions }`
 *          where `state` is the {@link TimerState} snapshot and `actions` is the
 *          memoised {@link TimerActions} bundle (`start`, `pause`, `resume`,
 *          `reset`, `saveAsDraft`, `confirmSaveAsDraft`, `openSaveModal`,
 *          `updateComment`).
 */
export function useTimer(): UseTimerReturn {
	const hydrated = useHydration();

	// Store selectors (reactive)
	const sessionId = useTimerStore((s) => s.sessionId);
	const draftId = useTimerStore((s) => s.draftId);
	const elapsedTime = useTimerStore((s) => s.elapsedTime);
	const startTime = useTimerStore((s) => s.startTime);
	const status = useTimerStore((s) => s.status);
	const comment = useTimerStore((s) => s.comment);
	const isSaving = useTimerStore((s) => s.isSaving);
	const isLoading = useTimerStore((s) => s.isLoading);
	const error = useTimerStore((s) => s.error);
	const _serverSync = useTimerStore((s) => s._serverSync);

	// Store actions
	const store = useTimerStore.getState();

	// User profile
	const userProfile = useUserStore((s) => s.supabaseUser);

	// Draft store for auto-save
	const { autoSaveDraft } = useDraftStore();

	// Modal store for save modal
	const { openTimerSave, openEmptyCommentConfirmation, closeEmptyCommentConfirmation } = useModalStore();

	// Time entries for refetch after save
	const { refetch: refetchTimeEntries } = useTimeEntriesStore();

	// Local error state for hook-level errors
	const [hookError, setHookError] = useState<string | null>(null);

	// Monday context
	const { rawContext, sessionToken } = useMondayStore();

	// ============================================
	// Helper Functions
	// ============================================

	/**
	 * Get Monday context for API calls
	 */
	const getMondayContext = useCallback(async () => {
		return rawContext;
	}, [rawContext]);

	/**
	 * Make API call with Monday context and Authorization header
	 */
	const apiCall = useCallback(
		async <T>(url: string, options: RequestInit = {}): Promise<T> => {
			if (!sessionToken) {
				console.warn(`[TimerHook] Skipping API call to ${url} because sessionToken is missing`);
				throw new Error("Session token not available. Please wait for initialization.");
			}

			const context = await getMondayContext();
			const response = await fetch(url, {
				...options,
				headers: {
					"Content-Type": "application/json",
					"monday-context": JSON.stringify(context),
					Authorization: `Bearer ${sessionToken}`,
					...options.headers,
				},
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `API call failed: ${response.status}`);
			}

			return response.json();
		},
		[getMondayContext],
	);

	// ============================================
	// Session Loading
	// ============================================

	useEffect(() => {
		if (!hydrated || !userProfile) {
			store.setLoading(false);
			return;
		}

		const loadSession = async () => {
			try {
				store.setLoading(true);
				store.setError(null);

				const data = await apiCall<{ session: any; serverTime: string }>("/api/timer/session");

				const session = data.session;

				if (session) {
					// Update store with session data
					store.setSession({
						id: session.id,
						draft_id: session.time_entry?.id || session.draft_id || null,
						start_time: session.start_time,
						is_paused: session.is_paused,
					});

					// Set elapsed time from server
					store.setElapsedTime(session.calculatedElapsedTime);
					store.updateServerSync(session.calculatedElapsedTime);

					// Set comment if exists
					if (session.time_entry?.comment) {
						store.setComment(session.time_entry.comment);
					}
				} else {
					store.reset();
				}
			} catch (err: any) {
				console.error("Failed to load timer session:", err);
				store.setError(err.message || "Failed to load timer session");
				setHookError(err.message);
			} finally {
				store.setLoading(false);
			}
		};

		loadSession();
	}, [hydrated, userProfile, apiCall]);

	// ============================================
	// Real-time Subscription
	// ============================================

	useEffect(() => {
		if (!hydrated || !userProfile) return;

		let debounceTimeout: NodeJS.Timeout | null = null;
		let lastProcessedTimestamp: string | null = null;
		let pendingUpdate: RealTimeTimerSessionPayload | null = null;

		const channel = supabase
			.channel("timer-updates")
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "public",
					table: "timer_session",
				},
				async (payload: RealTimeTimerSessionPayload) => {
					// Filter out events from other users
					const shouldProcess = (() => {
						switch (payload.eventType) {
							case "INSERT":
							case "UPDATE":
								return payload.new?.user_id === userProfile.id;
							case "DELETE":
								return payload.old?.id === sessionId;
							default:
								return false;
						}
					})();

					if (!shouldProcess) return;

					// Keep only the latest update
					if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
						if (!pendingUpdate || payload.commit_timestamp > pendingUpdate.commit_timestamp) {
							pendingUpdate = payload;
						}
					} else {
						pendingUpdate = payload;
					}

					if (debounceTimeout) {
						clearTimeout(debounceTimeout);
					}

					// Debounce updates by 200ms
					debounceTimeout = setTimeout(async () => {
						if (!pendingUpdate) return;

						const finalPayload = pendingUpdate;
						pendingUpdate = null;

						// Skip old events
						if (lastProcessedTimestamp && finalPayload.commit_timestamp <= lastProcessedTimestamp) {
							return;
						}

						lastProcessedTimestamp = finalPayload.commit_timestamp;

						if (finalPayload.eventType === "INSERT" || finalPayload.eventType === "UPDATE") {
							const newData = finalPayload.new!;

							// Get elapsed time from the server to avoid clock drift
							let calculatedElapsedTime = newData.elapsed_time || 0;

							if (!newData.is_paused && newData.id) {
								try {
									// Use RPC to get server-calculated elapsed time
									const { data: rpcResult, error: rpcError } = await supabase.rpc("get_current_elapsed_time", { p_session_id: newData.id });

									if (!rpcError && rpcResult) {
										const typedResult = rpcResult as unknown as GetCurrentElapsedTimeResult;
										calculatedElapsedTime = typedResult.elapsed_time_ms;
									}
								} catch (error) {
									console.error("Error getting elapsed time from server:", error);
									calculatedElapsedTime = newData.elapsed_time || 0;
								}
							}

							// Update store
							store.setSession({
								id: newData.id,
								draft_id: newData.draft_id,
								start_time: newData.start_time,
								is_paused: newData.is_paused,
							});
							store.setElapsedTime(calculatedElapsedTime);
							store.updateServerSync(calculatedElapsedTime);
						} else if (finalPayload.eventType === "DELETE") {
							store.reset();
						}
					}, 200);
				},
			)
			.subscribe();

		return () => {
			if (debounceTimeout) {
				clearTimeout(debounceTimeout);
			}
			supabase.removeChannel(channel);
		};
	}, [hydrated, userProfile, sessionId]);

	// ============================================
	// Timer Interval
	// ============================================

	useEffect(() => {
		if (!hydrated) return;

		let interval: NodeJS.Timeout;
		const sync = _serverSync;

		if (sessionId && status === "running" && sync) {
			interval = setInterval(() => {
				// Calculate elapsed time based on server base + local time since sync
				const localTimeSinceSync = Date.now() - sync.syncedAt;
				const newElapsedTime = sync.baseElapsedTime + localTimeSinceSync;
				store.setElapsedTime(newElapsedTime);
			}, 1000);
		}

		return () => clearInterval(interval);
	}, [hydrated, sessionId, status, _serverSync]);

	// ============================================
	// Auto-save Comment
	// ============================================

	useEffect(() => {
		if (!sessionId || !userProfile?.id || !comment) return;

		const timer = setTimeout(async () => {
			await autoSaveDraft({
				comment,
				sessionId,
			});
		}, 500);

		return () => clearTimeout(timer);
	}, [comment, sessionId, userProfile?.id, autoSaveDraft]);

	// ============================================
	// Core Actions (Internal)
	// ============================================

	/**
	 * Internal function to perform the actual save as draft logic
	 */
	const performSaveAsDraft = useCallback(async () => {
		if (!userProfile?.id || !draftId || !sessionId) return;

		try {
			store.setError(null);

			// Use draft store's saveDraft for the actual save
			const { saveDraft } = useDraftStore.getState();
			await saveDraft({
				draftId,
				comment,
			});

			// Soft reset
			await apiCall("/api/timer/soft-reset", {
				method: "POST",
				body: JSON.stringify({
					draftId,
					sessionId,
				}),
			});

			// Reset local state
			store.reset();

			// Refetch time entries
			refetchTimeEntries(userProfile.id);
		} catch (err: any) {
			console.error("Failed to save as draft:", err);
			store.setError(err.message || "Failed to save as draft");
			setHookError(err.message);
		}
	}, [userProfile?.id, draftId, sessionId, comment, getMondayContext, refetchTimeEntries]);

	// ============================================
	// Timer Actions
	// ============================================

	const actions: TimerActions = useMemo(
		() => ({
			/**
			 * Start or resume timer
			 */
			start: async () => {
				try {
					store.setError(null);

					const data = await apiCall<any>("/api/timer/start", {
						method: "POST",
						body: JSON.stringify({}),
					});

					if (data.resumed) {
						store.setSession({
							id: data.session.id,
							draft_id: data.session.draft_id,
							start_time: data.session.start_time,
							is_paused: false,
						});
						store.setElapsedTime(data.elapsedTime);
						store.updateServerSync(data.elapsedTime);
					} else {
						store.setSession({
							id: data.session.id,
							draft_id: data.draft.id,
							start_time: data.session.start_time,
							is_paused: false,
						});
						store.setElapsedTime(0);
						store.updateServerSync(0);
					}
				} catch (err: any) {
					console.error("Failed to start timer:", err);
					store.setError(err.message || "Failed to start timer");
					setHookError(err.message);
				}
			},

			/**
			 * Pause running timer
			 */
			pause: async () => {
				if (!sessionId) return;

				try {
					store.setError(null);

					const data = await apiCall<any>("/api/timer/pause", {
						method: "POST",
						body: JSON.stringify({
							sessionId,
							elapsedTime,
							isPausing: true,
						}),
					});

					store.setStatus("paused");
					store.setElapsedTime(data.elapsedTime);
					store.updateServerSync(data.elapsedTime);
				} catch (err: any) {
					console.error("Failed to pause timer:", err);
					store.setError(err.message || "Failed to pause timer");
					setHookError(err.message);
				}
			},

			/**
			 * Resume paused timer
			 */
			resume: async () => {
				if (!sessionId) return;

				try {
					store.setError(null);

					const data = await apiCall<any>("/api/timer/pause", {
						method: "POST",
						body: JSON.stringify({
							sessionId,
							elapsedTime,
							isPausing: false,
						}),
					});

					store.setStatus("running");
					store.setElapsedTime(data.elapsedTime);
					store.updateServerSync(data.elapsedTime);
				} catch (err: any) {
					console.error("Failed to resume timer:", err);
					store.setError(err.message || "Failed to resume timer");
					setHookError(err.message);
				}
			},

			/**
			 * Reset timer completely (deletes draft)
			 */
			reset: async () => {
				if (!userProfile?.id || !draftId || !sessionId) return;

				console.log("Resetting timer with sessionId:", sessionId, "and draftId:", draftId);

				try {
					store.setError(null);

					// Reset local state first for immediate feedback
					store.reset();

					await apiCall("/api/timer/reset", {
						method: "POST",
						headers: {
							"session-id": sessionId,
							"draft-id": draftId,
						},
					});
				} catch (err: any) {
					console.error("Failed to reset timer:", err);
					store.setError(err.message || "Failed to reset timer");
					setHookError(err.message);
				}
			},

			/**
			 * Save as draft (soft reset - keeps entry but clears session)
			 */
			saveAsDraft: async () => {
				if (!comment || comment.trim() === "") {
					openEmptyCommentConfirmation();
					return;
				}
				await performSaveAsDraft();
			},

			/**
			 * Confirm save as draft (bypasses empty comment check)
			 */
			confirmSaveAsDraft: async () => {
				closeEmptyCommentConfirmation();
				await performSaveAsDraft();
			},

			/**
			 * Open save modal
			 */
			openSaveModal: () => {
				// Pause timer first if running
				if (status === "running") {
					actions.pause();
				}
				openTimerSave();
			},

			/**
			 * Update comment
			 */
			updateComment: (newComment: string) => {
				store.setComment(newComment);
			},
		}),
		[sessionId, draftId, elapsedTime, status, comment, userProfile?.id, apiCall, getMondayContext, openTimerSave, openEmptyCommentConfirmation, closeEmptyCommentConfirmation, refetchTimeEntries, performSaveAsDraft],
	);

	// ============================================
	// Build State Object
	// ============================================

	const state: TimerState = useMemo(
		() => ({
			sessionId,
			draftId,
			elapsedTime,
			startTime,
			status,
			comment,
			isSaving,
			isLoading,
			error: error || hookError,
			_serverSync,
		}),
		[sessionId, draftId, elapsedTime, startTime, status, comment, isSaving, isLoading, error, hookError, _serverSync],
	);

	// ============================================
	// Computed Values
	// ============================================

	const isActive = status === "running";
	const hasSession = sessionId !== null;
	const canSave = hasSession && !isSaving;

	// Return loading state if not hydrated
	if (!hydrated) {
		return {
			state: {
				sessionId: null,
				draftId: null,
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
