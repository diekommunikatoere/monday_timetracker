import { useState } from "react";
import { useMondayContext } from "./useMondayContext";
import { useDraftAutoSave } from "./useDraftAutoSave";

export function useCommentFieldState(initialValue: string = "", sessionId) {
	const [comment, setComment] = useState(initialValue);
	const { getUserId } = useMondayContext();

	// Auto-save draft when comment changes
	useDraftAutoSave({ comment, userId: getUserId(), sessionId });

	const clearComment = () => setComment("");

	return { comment, setComment, clearComment };
}
