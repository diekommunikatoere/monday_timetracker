import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";

interface UseDraftAutoSaveProps {
	comment: string;
	userId: string;
	sessionId?: string;
}

export function useDraftAutoSave({ comment, userId, sessionId }: UseDraftAutoSaveProps) {
	const { showToast } = useToast();
	const [isSaving, setIsSaving] = useState(false);

	const debounceRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);

		debounceRef.current = setTimeout(async () => {
			try {
				// Check for existing draft (but don't create if comment is empty and no draft exists)
				// Select draft from draft_id in session entry if available
				const { data: session } = await supabase.from("timer_session").select("draft_id").eq("id", sessionId).single();
				const draftId = session?.draft_id;

				if (draftId) {
					const { data: existingDraft, error } = await supabase.from("time_entry").select("*").eq("id", draftId).single();

					if (error) throw error;

					console.log("Auto-saving draft:", { comment, existingDraft });

					if (existingDraft) {
						// Update existing draft
						await supabase.from("time_entry").update({ comment }).eq("id", existingDraft.id);
						setIsSaving(true);
					} else if (comment.trim()) {
						// Only create new draft if there's actual content
						await supabase.from("time_entry").insert({
							user_id: userId,
							comment,
							start_time: new Date().toISOString(),
							is_draft: true,
						});
						setIsSaving(true);
					}
					setIsSaving(false);
				}
			} catch (error) {
				console.error("Error auto-saving draft:", error);
			}
		}, 500);

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [comment, userId]);
}

const useDraftCache = () => {
	const [cache, setCache] = useState<Map<string, any>>(new Map());

	const getCachedDraft = (userId: string) => cache.get(`draft_${userId}`);
	const setCachedDraft = (userId: string, draft: any) => {
		setCache((prev) => new Map(prev).set(`draft_${userId}`, draft));
	};

	return { getCachedDraft, setCachedDraft };
};
