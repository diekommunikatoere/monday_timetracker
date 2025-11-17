import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

interface UseDraftAutoSaveProps {
	comment: string;
	userId: string;
}

export function useDraftAutoSave({ comment, userId }: UseDraftAutoSaveProps) {
	const debounceRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);

		debounceRef.current = setTimeout(async () => {
			try {
				// Check for existing draft (but don't create if comment is empty and no draft exists)
				const { data: existingDraft } = await supabase.from("time_entry").select("id").eq("user_id", userId).eq("is_draft", true).single();

				if (existingDraft) {
					// Update existing draft
					await supabase.from("time_entry").update({ comment }).eq("id", existingDraft.id);
				} else if (comment.trim()) {
					// Only create new draft if there's actual content
					await supabase.from("time_entry").insert({
						user_id: userId,
						comment,
						start_time: new Date().toISOString(),
						is_draft: true,
					});
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
