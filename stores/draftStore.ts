// stores/draftStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "@/lib/supabase/client";

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
	autoSaveDraft: (params: { comment: string; userId: string; sessionId?: string }) => void;

	// Manual save
	saveDraft: (params: { draftId: string; userProfileId: string; taskName?: string; comment: string; onSaved?: () => void; showToast?: (message: string, type: string, duration: number) => void }) => Promise<void>;

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

			autoSaveDraft: async ({ comment, userId, sessionId }) => {
				// Clear existing debounce timer
				const currentTimer = get().debounceTimerId;
				if (currentTimer) clearTimeout(currentTimer);

				// Set new debounce timer
				const timerId = setTimeout(async () => {
					try {
						// Get draft_id from session
						const { data: session } = await supabase.from("timer_session").select("draft_id").eq("id", sessionId).single();

						const draftId = session?.draft_id;

						if (draftId) {
							const { data: existingDraft, error } = await supabase.from("time_entry").select("*").eq("id", draftId).single();

							if (error) throw error;

							console.log("Auto-saving draft:", { comment, existingDraft });

							if (existingDraft) {
								// Update existing draft
								await supabase.from("time_entry").update({ comment }).eq("id", existingDraft.id);
								set({ isSaving: true });
							} else if (comment.trim()) {
								// Only create new draft if there's actual content
								await supabase.from("time_entry").insert({
									user_id: userId,
									comment,
									start_time: new Date().toISOString(),
									is_draft: true,
								});
								set({ isSaving: true });
							}

							// Reset saving state
							setTimeout(() => set({ isSaving: false }), 500);
						}
					} catch (error) {
						console.error("Error auto-saving draft:", error);
						set({ error: error instanceof Error ? error.message : "Unknown error" });
					}
				}, 500);

				set({ debounceTimerId: timerId });
			},

			saveDraft: async ({ draftId, userProfileId, taskName, comment, onSaved, showToast }) => {
				if (!userProfileId || !draftId) {
					set({ error: "Missing user profile or draft ID" });
					return;
				}

				set({ isSaving: true, error: null });

				try {
					const finalTaskName = taskName && taskName.trim() ? taskName : "Ungespeicherter Zeiteintrag";
					console.log("finalizing draft with: ", userProfileId, draftId, finalTaskName, comment);

					// Call RPC with supabase user_id (from user_profiles.id mapped from monday_user_id)
					const { data, error } = await supabase.rpc("finalize_draft", {
						p_user_id: userProfileId, // Supabase user_profiles.id
						p_draft_id: draftId,
						p_task_name: finalTaskName,
						p_comment: comment,
					});

					if (error) {
						throw error;
					}

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
		}
	)
);
