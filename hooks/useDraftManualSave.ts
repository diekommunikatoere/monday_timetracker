import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Database } from "@/types/database";

type TimerSession = Database["public"]["Tables"]["timer_session"]["Row"];
type TimerSegment = Database["public"]["Tables"]["timer_segment"]["Row"];

export function useDraftManualSave(id: string, comment: string) {
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [taskName, setTaskName] = useState("");
	const [endTime, setEndTime] = useState("");
	const [timerSegments, setTimerSegments] = useState<TimerSegment | null>(null);
	const [timerSession, setTimerSession] = useState<TimerSession | null>(null);

	// Set task_name as comment if not provided
	useEffect(() => {
		if (!taskName && comment.trim()) {
			setTaskName(comment);
		} else if (!comment.trim()) {
			setTaskName("Ungespeicherter Zeiteintrag");
		}
	}, [comment, taskName]);

	useEffect(() => {
		setEndTime(Date.now().toString());
	}, []);

	// Fetch timer_session
	const fetchTimerSession = async () => {
		console.log("Fetching timer session by time_entry id:", id);
		try {
			const { data } = await supabase.from("timer_session").select("*").eq("draft_id", id).single();

			console.log("Fetched timer session data:", data);

			if (data.id) {
				setTimerSession(data);
			}
		} catch (error) {
			console.error("Error fetching timer session:", error);
		}
	};

	const saveDraft = async () => {
		setIsSaving(true);
		setError(null);
		await fetchTimerSession();

		console.log("Saving draft with:", { id, taskName, endTime, comment, timerSession });

		setIsSaving(false);

		return;

		/* try {
			await supabase
				.from("time_entry")
				.update({
					task_name: taskName,
					end_time,
					comment,
					timer_session,
					is_draft: true,
				})
				.eq("id", id);
		} catch (err) {
			console.error("Error saving draft:", err);
			setError("Failed to save draft. Please try again.");
		} finally {
			setIsSaving(false);
		} */
	};

	return { saveDraft, isSaving, error, taskName, setTaskName };
}

const useDraftCache = () => {
	const [cache, setCache] = useState<Map<string, any>>(new Map());

	const getCachedDraft = (userId: string) => cache.get(`draft_${userId}`);
	const setCachedDraft = (userId: string, draft: any) => {
		setCache((prev) => new Map(prev).set(`draft_${userId}`, draft));
	};

	return { getCachedDraft, setCachedDraft };
};
