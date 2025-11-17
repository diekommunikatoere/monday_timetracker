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
	isRunning: boolean;
	elapsedTime: number;
	startTime: string | null;
	isPaused: boolean;
	draftId: string | null;
	sessionId: string | null;
}

export function useTimerState(userId: string) {
	const { userProfile } = useMondayContext();
	const { setComment } = useCommentFieldState();
	const [state, setState] = useState<TimerState>({
		isRunning: false,
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

				const session = data.session;

				if (session) {
					setState({
						isRunning: session.is_running,
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
					// No active session
					setState({
						isRunning: false,
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

		const currentSessionId = state.sessionId;

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
								return payload.old?.id === state.sessionId;
							default:
								return false;
						}
					})();

					if (!shouldProcess) {
						return;
					}

					if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
						const newData = payload.new;

						// Calculate elapsed time for running sessions
						let calculatedElapsedTime = newData.elapsed_time || 0;
						if (newData.is_running && !newData.is_paused) {
							try {
								const { data: currentSegment } = await supabase.from("timer_segment").select("start_time").eq("session_id", newData.id).eq("is_running", true).is("end_time", null).order("start_time", { ascending: false }).limit(1).single();

								if (currentSegment) {
									const segmentStartTime = new Date(currentSegment.start_time).getTime();
									calculatedElapsedTime = newData.elapsed_time + (Date.now() - segmentStartTime);
								}
							} catch (error) {
								console.error("Error calculating elapsed time:", error);
							}
						}

						setState({
							isRunning: newData.is_running,
							elapsedTime: calculatedElapsedTime,
							startTime: newData.start_time,
							isPaused: newData.is_paused,
							draftId: newData.draft_id,
							sessionId: newData.id,
						});
					} else if (payload.eventType === "DELETE") {
						// Reset state when our session is deleted
						setState({
							isRunning: false,
							elapsedTime: 0,
							startTime: null,
							isPaused: false,
							draftId: null,
							sessionId: null,
						});
					}
				}
			)
			.subscribe((status, err) => {
				console.log("Subscription status:", status);
				if (err) {
					console.error("Subscription error:", err);
				}
			});

		return () => {
			console.log("Unsubscribing from timer-updates");
			supabase.removeChannel(channel);
		};
	}, [userProfile, state.sessionId]);

	// Timer interval for counting elapsed time
	useEffect(() => {
		let interval: NodeJS.Timeout;
		if (state.isRunning && !state.isPaused) {
			interval = setInterval(() => {
				setState((prev) => ({
					...prev,
					elapsedTime: prev.elapsedTime + 1000,
				}));
			}, 1000);
		}
		return () => clearInterval(interval);
	}, [state.isRunning, state.isPaused]);

	// Start timer: Create draft time_entry and timer_session
	const startTimer = useCallback(async () => {
		if (!userProfile || state.isRunning || state.isPaused || state.sessionId) return;

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

			if (data.resumed) {
				// Resumed existing session
				setState({
					isRunning: true,
					elapsedTime: data.elapsedTime,
					startTime: data.session.start_time,
					isPaused: false,
					draftId: data.session.draft_id,
					sessionId: data.session.id,
				});
			} else {
				// Created new session
				setState((prev) => ({
					...prev,
					isRunning: true,
					elapsedTime: 0,
					startTime: data.session.start_time,
					isPaused: false,
					draftId: data.draft.id,
					sessionId: data.session.id,
				}));
			}
		} catch (err: any) {
			console.error("Failed to start timer:", err);
			// Rollback on error
			setState((prev) => ({
				...prev,
				isRunning: false,
				elapsedTime: 0,
				startTime: null,
				isPaused: false,
				draftId: null,
				sessionId: null,
			}));
			setError(err.message || "Failed to start timer");
		}
	}, [userProfile, state.isRunning, state.isPaused, state.sessionId]);

	// Pause/Resume timer: Toggle pause state and update segments
	const pauseTimer = useCallback(async () => {
		if (!userProfile || !state.sessionId || (!state.isRunning && !state.isPaused)) {
			return;
		}

		const isPausing = state.isRunning && !state.isPaused;

		try {
			setError(null);

			// Optimistic update
			setState((prev) => ({
				...prev,
				isPaused: isPausing ? true : false,
			}));

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
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to toggle timer");
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
	}, [userProfile, state.sessionId, state.isRunning, state.isPaused, state.elapsedTime]);

	// Reset timer: Delete draft and session
	const resetTimer = useCallback(async () => {
		if (!userProfile || !state.draftId || !state.sessionId) return;

		try {
			setError(null);

			const draftIdTemp = state.draftId;
			const sessionIdTemp = state.sessionId;

			// Optimistic update
			setState({
				isRunning: false,
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
						isRunning: session.is_running,
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
	};
}
