"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import { useMondayContext } from "./useMondayContext";

interface UseDraftManualSaveProps {
	comment: string;
	onSaved?: () => void;
}

export function useDraftManualSave({ comment, onSaved }: UseDraftManualSaveProps) {
	const { showToast } = useToast();
	const { userProfile } = useMondayContext();
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [taskName, setTaskName] = useState("");

	// Set task_name as comment if not provided
	useEffect(() => {
		if (!taskName && comment.trim()) {
			setTaskName(comment);
		} else if (!comment.trim()) {
			setTaskName("Ungespeicherter Zeiteintrag");
		}
	}, [comment, taskName]);

	const saveDraft = async (draftId: string) => {
		if (!userProfile?.id || !draftId) {
			setError("Missing user profile or draft ID");
			return;
		}

		setIsSaving(true);
		setError(null);

		try {
			console.log("finalizing draft with: ", userProfile.id, draftId, taskName, comment);
			// Call RPC with supabase user_id (from user_profiles.id mapped from monday_user_id)
			const { data, error } = await supabase.rpc("finalize_draft", {
				p_user_id: userProfile.id, // Supabase user_profiles.id
				p_draft_id: draftId,
				p_task_name: taskName,
				p_comment: comment,
			});

			if (error) {
				throw error;
			}

			console.log("Draft finalized:", data);

			if (onSaved) {
				onSaved();
			}

			showToast("Zeiteintrag gespeichert.", "positive", 2000);
		} catch (err: any) {
			console.error("Error finalizing draft:", err);
			setError(err.message || "Failed to save draft. Please try again.");
		} finally {
			setIsSaving(false);
		}
	};

	return { saveDraft, isSaving, error, taskName, setTaskName };
}
