// hooks/useTimerState.ts
"use client";

import { useState, useEffect, useCallback } from "react";
import mondaySdk from "monday-sdk-js";
import type { Database } from "@/types/database";
import { supabase } from "@/lib/supabase/client";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
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
 * SSR-safe wrapper for timer state management
 * Waits for hydration before accessing persisted store values
 */
export function useTimerStateSSR() {
	const hydrated = useHydration();

	// Get state from stores (with hydration safety)
	const elapsedTime = useTimerStore((state) => (hydrated ? state.elapsedTime : 0));
	const startTime = useTimerStore((state) => (hydrated ? state.startTime : null));
	const isPaused = useTimerStore((state) => (hydrated ? state.isPaused : false));
	const draftId = useTimerStore((state) => (hydrated ? state.draftId : null));
	const sessionId = useTimerStore((state) => (hydrated ? state.sessionId : null));
	const comment = useTimerStore((state) => (hydrated ? state.comment : ""));
	const isSaving = useTimerStore((state) => (hydrated ? state.isSaving : false));
	const storeError = useTimerStore((state) => (hydrated ? state.error : null));

	const userProfile = useUserStore((state) => state.supabaseUser);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Helper to get monday context for API calls
	const getMondayContextHeader = async () => {
		const context = await monday.get("context");
		return { "monday-context": JSON.stringify(context) };
	};

	// Load current timer session on mount or user change
	useEffect(() => {
		if (!hydrated || !userProfile) {
			setLoading(false);
			return;
		}

		const loadTimerSession = async () => {
			try {
				setLoading(true);
				setError(null);

				const headers = await getMondayContextHeader();
				const response = await fetch("/api/timer/session", { headers });
				if (!response.ok) {
					throw new Error("Failed to load session");
				}
				const data = await response.json();

				const session = data.session;

				if (session) {
					useTimerStore.setState({
						elapsedTime: session.calculatedElapsedTime,
						startTime: session.start_time,
						isPaused: session.is_paused,
						draftId: session.time_entry?.id || session.draft_id || null,
						sessionId: session.id,
					});

					if (session.time_entry?.comment) {
						useTimerStore.setState({ comment: session.time_entry.comment });
					}
				} else {
					useTimerStore.setState({
						elapsedTime: 0,
						startTime: null,
						isPaused: false,
						draftId: null,
						sessionId: null,
						comment: "",
					});
				}
			} catch (err: any) {
				console.error("Failed to load timer session:", err);
				setError(err.message || "Failed to load timer session");
			} finally {
				setLoading(false);
			}
		};

		loadTimerSession();
	}, [hydrated, userProfile]);

	// Real-time subscription for cross-device sync
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

							// Calculate elapsed time
							let calculatedElapsedTime = newData.elapsed_time || 0;

							if (!newData.is_paused && newData.id) {
								try {
									const { data: currentSegment } = await supabase.from("timer_segment").select("start_time").eq("session_id", newData.id).is("end_time", null).order("start_time", { ascending: false }).limit(1).maybeSingle();

									if (currentSegment) {
										const segmentStartTime = new Date(currentSegment.start_time).getTime();
										calculatedElapsedTime = newData.elapsed_time + (Date.now() - segmentStartTime);
									}
								} catch (error) {
									console.error("Error calculating elapsed time:", error);
								}
							}

							useTimerStore.setState({
								elapsedTime: calculatedElapsedTime,
								startTime: newData.start_time,
								isPaused: newData.is_paused,
								draftId: newData.draft_id,
								sessionId: newData.id,
							});
						} else if (finalPayload.eventType === "DELETE") {
							useTimerStore.setState({
								elapsedTime: 0,
								startTime: null,
								isPaused: false,
								draftId: null,
								sessionId: null,
							});
						}
					}, 200);
				}
			)
			.subscribe();

		return () => {
			if (debounceTimeout) {
				clearTimeout(debounceTimeout);
			}
			supabase.removeChannel(channel);
		};
	}, [hydrated, userProfile, sessionId]);

	// Timer interval for counting elapsed time
	useEffect(() => {
		if (!hydrated) return;

		let interval: NodeJS.Timeout;
		if (sessionId && !isPaused) {
			interval = setInterval(() => {
				useTimerStore.setState((prev) => ({
					...prev,
					elapsedTime: prev.elapsedTime + 1000,
				}));
			}, 1000);
		}
		return () => clearInterval(interval);
	}, [hydrated, sessionId, isPaused]);

	// Timer actions
	const startTimer = useCallback(async () => {
		try {
			const context = await monday.get("context");
			await useTimerStore.getState().startTimer(context);
		} catch (err: any) {
			console.error("Failed to start timer:", err);
			setError(err.message || "Failed to start timer");
		}
	}, []);

	const pauseTimer = useCallback(async () => {
		try {
			const context = await monday.get("context");
			await useTimerStore.getState().pauseTimer(context);
		} catch (err: any) {
			console.error("Failed to pause timer:", err);
			setError(err.message || "Failed to pause timer");
		}
	}, []);

	const resetTimer = useCallback(async () => {
		try {
			const context = await monday.get("context");
			await useTimerStore.getState().resetTimer(context);
		} catch (err: any) {
			console.error("Failed to reset timer:", err);
			setError(err.message || "Failed to reset timer");
		}
	}, []);

	const softResetTimer = useCallback(async () => {
		try {
			const context = await monday.get("context");
			await useTimerStore.getState().softResetTimer(context);
		} catch (err: any) {
			console.error("Failed to soft reset timer:", err);
			setError(err.message || "Failed to soft reset timer");
		}
	}, []);

	// Return loading state if not hydrated
	if (!hydrated) {
		return {
			elapsedTime: 0,
			startTime: null,
			isPaused: false,
			draftId: null,
			sessionId: null,
			comment: "",
			isSaving: false,
			error: null,
			loading: true,
			startTimer,
			pauseTimer,
			resetTimer,
			softResetTimer,
		};
	}

	return {
		elapsedTime,
		startTime,
		isPaused,
		draftId,
		sessionId,
		comment,
		isSaving,
		error: error || storeError,
		loading,
		startTimer,
		pauseTimer,
		resetTimer,
		softResetTimer,
	};
}
