// stores/draftStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMondayStore } from "./mondayStore";

declare global {
	interface Window {
		monday?: {
			token?: string;
		};
	}
}

interface DraftState {
	// Comment state
	comment: string;

	// Draft metadata
	taskName: string;

	// Saving states
	isSaving: boolean;
	error: string | null;

	// Debounce timer reference
	debounceTimerId: NodeJS.Timeout | null;

	// Actions
	setComment: (comment: string) => void;
	clearComment: () => void;
	setTaskName: (taskName: string) => void;

	// Auto-save (debounced)
	autoSaveDraft: (params: { comment: string; sessionId?: string }) => void;

	// Manual save
	saveDraft: (params: { draftId: string; taskName?: string; comment: string; onSaved?: () => void; showToast?: (message: string, type: string, duration: number) => void }) => Promise<void>;

	// Internal state management
	setSaving: (isSaving: boolean) => void;
	setError: (error: string | null) => void;
	clearDebounce: () => void;
}

export const useDraftStore = create<DraftState>()(
	persist(
		(set, get) => ({
			comment: "",
			taskName: "",
			isSaving: false,
			error: null,
			debounceTimerId: null,

			setComment: (comment) => {
				set({ comment });
				// Update task name if not manually set
				const state = get();
				if (!state.taskName && comment.trim()) {
					set({ taskName: comment });
				} else if (!comment.trim() && !state.taskName) {
					set({ taskName: "Ungespeicherter Zeiteintrag" });
				}
			},

			clearComment: () => set({ comment: "", taskName: "" }),

			setTaskName: (taskName) => set({ taskName }),

			autoSaveDraft: async ({ comment, sessionId }) => {
				// Clear existing debounce timer
				const currentTimer = get().debounceTimerId;
				if (currentTimer) clearTimeout(currentTimer);

				// Set new debounce timer
				const timerId = setTimeout(async () => {
					try {
						const sessionToken = useMondayStore.getState().sessionToken;
						if (!sessionToken) return;

						console.log("Auto-saving draft via API:", { comment, sessionId });

						const response = await fetch("/api/timer/draft", {
							method: "PATCH",
							headers: {
								"Content-Type": "application/json",
								Authorization: `Bearer ${sessionToken}`,
							},
							body: JSON.stringify({ comment, sessionId }),
						});

						if (!response.ok) {
							const errorData = await response.json();
							throw new Error(errorData.error || "Failed to auto-save draft");
						}

						set({ isSaving: true });

						// Reset saving state
						setTimeout(() => set({ isSaving: false }), 500);
					} catch (error) {
						console.error("Error auto-saving draft:", error);
						set({ error: error instanceof Error ? error.message : "Unknown error" });
					}
				}, 500);

				set({ debounceTimerId: timerId });
			},

			saveDraft: async ({ draftId, taskName, comment, onSaved, showToast }) => {
				if (!draftId) {
					set({ error: "Missing draft ID" });
					return;
				}

				const sessionToken = useMondayStore.getState().sessionToken;
				if (!sessionToken) return;

				set({ isSaving: true, error: null });

				try {
					const finalTaskName = taskName && taskName.trim() ? taskName : "Unzugeordneter Zeiteintrag";
					console.log("finalizing draft via API:", { draftId, finalTaskName, comment });

					const response = await fetch("/api/timer/finalize", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${sessionToken}`,
						},
						body: JSON.stringify({ draftId, taskName: finalTaskName, comment }),
					});

					if (!response.ok) {
						const errorData = await response.json();
						throw new Error(errorData.error || "Failed to save draft");
					}

					const data = await response.json();
					console.log("Draft finalized:", data);

					if (onSaved) {
						onSaved();
					}

					if (showToast) {
						showToast("Zeiteintrag gespeichert.", "positive", 2000);
					}

					// Clear state after successful save
					set({ comment: "", taskName: "", error: null });
				} catch (err: any) {
					console.error("Error finalizing draft:", err);
					set({ error: err.message || "Failed to save draft. Please try again." });
				} finally {
					set({ isSaving: false });
				}
			},

			setSaving: (isSaving) => set({ isSaving }),
			setError: (error) => set({ error }),
			clearDebounce: () => {
				const timerId = get().debounceTimerId;
				if (timerId) {
					clearTimeout(timerId);
					set({ debounceTimerId: null });
				}
			},
		}),
		{
			name: "draft-store",
			skipHydration: true, // Important for Next.js SSR
			partialize: (state) => ({
				comment: state.comment,
				taskName: state.taskName,
				// Don't persist saving states or timers
			}),
		},
	),
);
