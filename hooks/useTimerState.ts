import { useState, useEffect, useCallback } from "react";
import mondaySdk from "monday-sdk-js";
import { useMondayContext } from "@/hooks/useMondayContext";
import { useCommentFieldState } from "@/hooks/useCommentFieldState";
import type { Database } from "@/types/database";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

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

interface TimerState {
	elapsedTime: number;
	startTime: string | null;
	isPaused: boolean;
	draftId: string | null;
	sessionId: string | null;
}

export function useTimerState() {
	const { userProfile } = useMondayContext();
	const { setComment } = useCommentFieldState();
	const [state, setState] = useState<TimerState>({
		elapsedTime: 0,
		startTime: null,
		isPaused: false,
		draftId: null,
		sessionId: null,
	});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Helper to get monday context for API calls
	const getMondayContextHeader = async () => {
		const context = await monday.get("context");
		return { "monday-context": JSON.stringify(context) };
	};

	// Load current timer session on mount or user change
	useEffect(() => {
		if (!userProfile) {
			setLoading(false);
			return;
		}

		const loadTimerSession = async () => {
			try {
				setLoading(true);
				setError(null);

				// Fetch via API
				const headers = await getMondayContextHeader();
				const response = await fetch("/api/timer/session", { headers });
				if (!response.ok) {
					throw new Error("Failed to load session");
				}
				const data = await response.json();

				console.log("Loaded timer session data:", data);

				const session = data.session;

				if (session) {
					console.log("Loaded existing timer session:", session);
					setState({
						elapsedTime: session.calculatedElapsedTime,
						startTime: session.start_time,
						isPaused: session.is_paused,
						draftId: session.draft_id,
						sessionId: session.id,
					});

					// Set the comment from the existing draft
					if (session.time_entry?.comment) {
						setComment(session.time_entry.comment);
					}
				} else {
					console.log("No active timer session found");
					// No active session
					setState({
						elapsedTime: 0,
						startTime: null,
						isPaused: false,
						draftId: null,
						sessionId: null,
					});
					// Clear comment for new session
					setComment("");
				}
			} catch (err: any) {
				console.error("Failed to load timer session:", err);
				setError(err.message || "Failed to load timer session");
				setLoading(false);
			} finally {
				setLoading(false);
			}
		};

		loadTimerSession();
	}, [userProfile]);

	// Real-time subscription for cross-device sync using Supabase client
	useEffect(() => {
		if (!userProfile) return;

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
					// Filter out events from other users first
					const shouldProcess = (() => {
						switch (payload.eventType) {
							case "INSERT":
							case "UPDATE":
								return payload.new?.user_id === userProfile.id;
							case "DELETE":
								return payload.old?.id === state.sessionId;
							default:
								return false;
						}
					})();

					if (!shouldProcess) {
						return;
					}

					// Only keep the latest update based on commit_timestamp
					if (payload.eventType === "UPDATE" || payload.eventType === "INSERT") {
						if (!pendingUpdate || payload.commit_timestamp > pendingUpdate.commit_timestamp) {
							pendingUpdate = payload;
						}
					} else {
						pendingUpdate = payload;
					}

					// Clear existing timeout
					if (debounceTimeout) {
						clearTimeout(debounceTimeout);
					}

					// Debounce updates by 200ms - process only the latest event
					debounceTimeout = setTimeout(async () => {
						if (!pendingUpdate) return;

						const finalPayload = pendingUpdate;
						pendingUpdate = null;

						console.log("Processing real-time event:", finalPayload.eventType, "timestamp:", finalPayload.commit_timestamp);

						// Skip if we already processed a newer timestamp
						if (lastProcessedTimestamp && finalPayload.commit_timestamp <= lastProcessedTimestamp) {
							console.log("Skipping old event");
							return;
						}

						lastProcessedTimestamp = finalPayload.commit_timestamp;

						if (finalPayload.eventType === "INSERT" || finalPayload.eventType === "UPDATE") {
							const newData = finalPayload.new;

							// For paused sessions, just use the stored elapsed_time
							let calculatedElapsedTime = newData.elapsed_time || 0;

							// Only calculate running time if not paused
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

							console.log("Setting isPaused to:", newData.is_paused);

							setState({
								elapsedTime: calculatedElapsedTime,
								startTime: newData.start_time,
								isPaused: newData.is_paused,
								draftId: newData.draft_id,
								sessionId: newData.id,
							});
						} else if (finalPayload.eventType === "DELETE") {
							setState({
								elapsedTime: 0,
								startTime: null,
								isPaused: false,
								draftId: null,
								sessionId: null,
							});
						}
					}, 200); // Reduced to 200ms
				}
			)
			.subscribe((status, err) => {
				console.log("Subscription status:", status);
				if (err) {
					console.error("Subscription error:", err);
				}
			});

		return () => {
			if (debounceTimeout) {
				clearTimeout(debounceTimeout);
			}
			console.log("Unsubscribing from timer-updates");
			supabase.removeChannel(channel);
		};
	}, [userProfile, state.sessionId]);

	// Timer interval for counting elapsed time
	useEffect(() => {
		let interval: NodeJS.Timeout;
		if (state.sessionId && !state.isPaused) {
			interval = setInterval(() => {
				setState((prev) => ({
					...prev,
					elapsedTime: prev.elapsedTime + 1000,
				}));
			}, 1000);
		}
		return () => clearInterval(interval);
	}, [state.sessionId, state.isPaused]);

	// Start timer: Create draft time_entry and timer_session
	const startTimer = useCallback(async () => {
		if (!userProfile) return;
		try {
			setError(null);

			// Call API to start timer
			const headers = await getMondayContextHeader();
			const response = await fetch("/api/timer/start", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				body: JSON.stringify({}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to start timer");
			}

			const data = await response.json();

			console.log("Timer started data session:", data.session);

			if (data.resumed) {
				// Resumed existing session
				setState({
					elapsedTime: data.elapsedTime,
					startTime: data.session.start_time,
					isPaused: false,
					draftId: data.session.draft_id,
					sessionId: data.session.id,
				});
				console.log("Timer resumed with existing session:", data.session.id);
			} else {
				// Created new session
				setState((prev) => ({
					...prev,
					elapsedTime: 0,
					startTime: data.session.start_time,
					isPaused: false,
					draftId: data.draft.id,
					sessionId: data.session.id,
				}));
				console.log("Timer started with new session:", data.session.id);
			}
		} catch (err: any) {
			console.error("Failed to start timer:", err);
			// Rollback on error
			setState((prev) => ({
				...prev,
				elapsedTime: 0,
				startTime: null,
				isPaused: false,
				draftId: null,
				sessionId: null,
			}));
			setError(err.message || "Failed to start timer");
		}
	}, [userProfile, state.sessionId]);

	// Pause/Resume timer: Toggle pause state and update segments
	const pauseTimer = useCallback(async () => {
		if (!userProfile || !state.sessionId || (!state.sessionId && !state.isPaused)) {
			return;
		}

		const isPausing = state.sessionId && !state.isPaused;

		try {
			setError(null);

			// Optimistic update

			// Call API to toggle pause
			const headers = await getMondayContextHeader();
			const response = await fetch("/api/timer/pause", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				body: JSON.stringify({
					sessionId: state.sessionId,
					elapsedTime: state.elapsedTime,
					isPausing: !state.isPaused,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to toggle timer");
			}

			console.log("Response from pause/resume API:", response);

			// Update state based on action and response
			if (response.ok && !isPausing) {
				console.log("Timer resumed after response check");
				setState((prev) => ({
					...prev,
					isPaused: false,
				}));
			} else if (response.ok && isPausing) {
				console.log("Timer paused after response check");
				setState((prev) => ({
					...prev,
					isPaused: true,
				}));
			}
		} catch (err: any) {
			console.error("pauseTimer failed:", err);
			// Rollback on error
			setState((prev) => ({
				...prev,
				isPaused: state.isPaused,
			}));
			setError(err.message || "Failed to toggle timer");
		}
	}, [userProfile, state.sessionId, state.isPaused, state.elapsedTime]);

	// Reset timer: Delete draft and session
	const resetTimer = useCallback(async () => {
		if (!userProfile || !state.draftId || !state.sessionId) return;

		try {
			setError(null);

			const draftIdTemp = state.draftId;
			const sessionIdTemp = state.sessionId;

			// Optimistic update
			setState({
				elapsedTime: 0,
				startTime: null,
				isPaused: false,
				draftId: null,
				sessionId: null,
			});

			// Call API to reset
			const headers = await getMondayContextHeader();
			const response = await fetch("/api/timer/reset", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				body: JSON.stringify({
					draftId: draftIdTemp,
					sessionId: sessionIdTemp,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to reset timer");
			}
		} catch (err: any) {
			console.error("Failed to reset timer:", err);
			// Rollback on error (reload from API)
			const headers = await getMondayContextHeader();
			const response = await fetch("/api/timer/session", { headers });
			if (response.ok) {
				const data = await response.json();
				const session = data.session;
				if (session) {
					setState({
						elapsedTime: session.calculatedElapsedTime,
						startTime: session.start_time,
						isPaused: session.is_paused,
						draftId: session.draft_id,
						sessionId: session.id,
					});
				}
			}
			setError(err.message || "Failed to reset timer");
		}
	}, [userProfile, state.draftId, state.sessionId]);

	// Soft reset timer: Delete session but keep draft
	const softResetTimer = useCallback(async () => {
		console.log("softResetTimer called");
		if (!userProfile || !state.draftId || !state.sessionId) return;

		try {
			setError(null);

			const draftIdTemp = state.draftId;
			const sessionIdTemp = state.sessionId;

			// Optimistic update
			setState({
				elapsedTime: 0,
				startTime: null,
				isPaused: false,
				draftId: null,
				sessionId: null,
			});

			// Call API to reset
			const headers = await getMondayContextHeader();
			const response = await fetch("/api/timer/soft-reset", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				body: JSON.stringify({
					draftId: draftIdTemp,
					sessionId: sessionIdTemp,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to reset timer");
			}
		} catch (err: any) {
			console.error("Failed to reset timer:", err);
			// Rollback on error (reload from API)
			const headers = await getMondayContextHeader();
			const response = await fetch("/api/timer/session", { headers });
			if (response.ok) {
				const data = await response.json();
				const session = data.session;
				if (session) {
					setState({
						elapsedTime: session.calculatedElapsedTime,
						startTime: session.start_time,
						isPaused: session.is_paused,
						draftId: session.draft_id,
						sessionId: session.id,
					});
				}
			}
			setError(err.message || "Failed to reset timer");
		}
	}, [userProfile, state.draftId, state.sessionId]);

	return {
		...state,
		loading,
		error,
		startTimer,
		pauseTimer,
		resetTimer,
		softResetTimer,
	};
}
