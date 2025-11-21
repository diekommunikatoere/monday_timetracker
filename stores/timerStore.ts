// stores/timerStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useUserStore } from "./userStore";

type TimerSession = {
	id: string;
	user_id: string;
	start_time: string;
	is_paused: boolean;
	elapsed_time: number;
	draft_id: string | null;
	time_entry?: {
		id: string;
		comment: string;
	} | null;
};

interface TimerState {
	// Timer session state
	elapsedTime: number;
	startTime: string | null;
	isPaused: boolean;
	draftId: string | null;
	sessionId: string | null;

	// Comment state
	comment: string;

	// UI state
	isSaving: boolean;
	error: string | null;

	// Actions
	startTimer: (mondayContext: any) => Promise<void>;
	pauseTimer: (mondayContext: any) => Promise<void>;
	resetTimer: (mondayContext: any) => Promise<void>;
	softResetTimer: (mondayContext: any) => Promise<void>;
	updateComment: (comment: string) => void;
	clearComment: () => void;
	setError: (error: string | null) => void;
}

export const useTimerStore = create<TimerState>()(
	persist(
		(set, get) => ({
			// Initial state
			elapsedTime: 0,
			startTime: null,
			isPaused: false,
			draftId: null,
			sessionId: null,
			comment: "",
			isSaving: false,
			error: null,

			// Actions
			startTimer: async (mondayContext: any) => {
				console.log("startTimer called");
				const user = useUserStore.getState().supabaseUser;
				console.log("Current timer state before start:", {
					userId: user?.id,
					sessionId: get().sessionId,
					isPaused: get().isPaused,
				});
				if (!user) return;
				try {
					set({ error: null });

					const headers = { "monday-context": JSON.stringify(mondayContext) };
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
						set({
							elapsedTime: data.elapsedTime,
							startTime: data.session.start_time,
							isPaused: false,
							draftId: data.session.draft_id,
							sessionId: data.session.id,
						});
						console.log("Timer resumed with existing session:", data.session.id);
					} else {
						set((prev) => ({
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
					set((prev) => ({
						...prev,
						elapsedTime: 0,
						startTime: null,
						isPaused: false,
						draftId: null,
						sessionId: null,
					}));
					set({ error: err.message || "Failed to start timer" });
				}
			},

			pauseTimer: async (mondayContext: any) => {
				console.log("pauseTimer called");
				const user = useUserStore.getState().supabaseUser;
				console.log("Current timer state before pause/resume:", {
					userId: user?.id,
					sessionId: get().sessionId,
					isPaused: get().isPaused,
				});
				if (!user || !get().sessionId || (!get().sessionId && !get().isPaused)) {
					return;
				}
				console.log("Current timer state before pause/resume:", {
					sessionId: get().sessionId,
					isPaused: get().isPaused,
				});

				const isPausing = get().sessionId && !get().isPaused;

				try {
					set({ error: null });

					const headers = { "monday-context": JSON.stringify(mondayContext) };
					const response = await fetch("/api/timer/pause", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...headers,
						},
						body: JSON.stringify({
							sessionId: get().sessionId,
							elapsedTime: get().elapsedTime,
							isPausing: !get().isPaused,
						}),
					});

					if (!response.ok) {
						const errorData = await response.json();
						throw new Error(errorData.error || "Failed to toggle timer");
					}

					console.log("Response from pause/resume API:", response);

					if (response.ok && !isPausing) {
						console.log("Timer resumed after response check");
						set((prev) => ({ ...prev, isPaused: false }));
					} else if (response.ok && isPausing) {
						console.log("Timer paused after response check");
						set((prev) => ({ ...prev, isPaused: true }));
					}
				} catch (err: any) {
					console.error("pauseTimer failed:", err);
					set((prev) => ({ ...prev, isPaused: get().isPaused }));
					set({ error: err.message || "Failed to toggle timer" });
				}
			},

			resetTimer: async (mondayContext: any) => {
				console.log("resetTimer called");
				const user = useUserStore.getState().supabaseUser;
				if (!user || !get().draftId || !get().sessionId) return;

				try {
					set({ error: null });

					const draftIdTemp = get().draftId;
					const sessionIdTemp = get().sessionId;

					set({
						elapsedTime: 0,
						startTime: null,
						isPaused: false,
						draftId: null,
						sessionId: null,
						comment: "",
						error: null,
					});

					const headers = { "monday-context": JSON.stringify(mondayContext) };
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
					set({ error: err.message || "Failed to reset timer" });
				}
			},

			softResetTimer: async (mondayContext: any) => {
				console.log("softResetTimer called");
				const user = useUserStore.getState().supabaseUser;
				if (!user || !get().draftId || !get().sessionId) return;

				try {
					set({ error: null });

					const draftIdTemp = get().draftId;
					const sessionIdTemp = get().sessionId;

					set({
						elapsedTime: 0,
						startTime: null,
						isPaused: false,
						draftId: null,
						sessionId: null,
					});

					const headers = { "monday-context": JSON.stringify(mondayContext) };
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
					set({ error: err.message || "Failed to reset timer" });
				}
			},

			updateComment: (comment: string) => {
				set({ comment });
			},

			clearComment: () => {
				set({ comment: "" });
			},

			setError: (error: string | null) => {
				set({ error });
			},
		}),
		{
			name: "timer-store",
			skipHydration: true, // Important for Next.js SSR
			partialize: (state) => ({
				comment: state.comment,
				draftId: state.draftId,
				sessionId: state.sessionId,
			}),
		}
	)
);
