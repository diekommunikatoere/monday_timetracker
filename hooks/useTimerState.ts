import { useState, useEffect, useCallback } from "react";
import mondaySdk from "monday-sdk-js";
import { useMondayContext } from "@/hooks/useMondayContext";
import { useCommentFieldState } from "@/hooks/useCommentFieldState";
import type { Database } from "@/types/database";

const monday = mondaySdk();

type TimerSession = Database["public"]["Tables"]["timer_session"]["Row"];

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

	// Real-time subscription for cross-device sync via SSE
	useEffect(() => {
		if (!userProfile) return;

		const eventSource = new EventSource(`/api/subscriptions/timer`);
		eventSource.onmessage = async (event) => {
			const payload = JSON.parse(event.data);

			// Comprehensive event filtering
			const shouldProcess = (() => {
				switch (payload.eventType) {
					case "INSERT":
					case "UPDATE":
						return payload.new?.user_id === userProfile.id;

					case "DELETE":
						// For DELETE events, check if this was our active session
						return payload.old?.id === state.sessionId;

					default:
						return false;
				}
			})();

			if (!shouldProcess) {
				return;
			}

			if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
				const newData = payload.new as TimerSession & { calculatedElapsedTime: number };

				setState({
					isRunning: newData.is_running,
					elapsedTime: newData.calculatedElapsedTime,
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
		};

		return () => eventSource.close();
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
