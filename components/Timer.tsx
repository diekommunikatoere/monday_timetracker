"use client";

import { useState, useEffect, useRef } from "react";
import { useMondayContext } from "@/hooks/useMondayContext";
import { useTimerState } from "@/hooks/useTimerState";
import { useCommentFieldState } from "@/hooks/useCommentFieldState";
import { useDraftManualSave } from "@/hooks/useDraftManualSave";
import { useTimeEntriesRefetch } from "@/contexts/TimeEntriesContext";
import { supabase } from "@/lib/supabase/client";
import { Box, Flex } from "@vibe/core";
import RunningTimerDisplay from "@/components/RunningTimerDisplay";
import TimerActionButtons from "@/components/TimerActionButtons";
import TimerCommentField from "@/components/TimerCommentField";

export default function Timer() {
	const refetch = useTimeEntriesRefetch();
	const { getUserId } = useMondayContext();
	const { elapsedTime, startTimer, pauseTimer, resetTimer, softResetTimer, isPaused, draftId, sessionId } = useTimerState();
	const [initialComment, setInitialComment] = useState("");
	const { clearComment, setComment, comment } = useCommentFieldState(initialComment, sessionId);
	const {
		saveDraft,
		isSaving,
		error: saveError,
		taskName,
		setTaskName,
	} = useDraftManualSave({
		comment,
		onSaved: refetch,
	});

	// Load comment from existing draft when session loads
	useEffect(() => {
		if (draftId) {
			const loadComment = async () => {
				const { data: draft } = await supabase.from("time_entry").select("comment").eq("id", draftId).single();

				if (draft?.comment) {
					setInitialComment(draft.comment);
					setComment(draft.comment);
				}
			};
			loadComment();
		} else {
			setInitialComment("");
			setComment("");
		}
	}, [draftId, setComment]);

	const handleStart = () => {
		console.log("Starting timer...");
		startTimer();
	};

	const handlePause = () => {
		pauseTimer();
		console.log("Timer paused.");
	};

	const handleResume = () => {
		startTimer();
	};

	const handleSaveAsDraft = async () => {
		if (draftId) {
			await saveDraft(draftId);
			softResetTimer();
		}
	};

	const handleSave = () => {
		// Implement full save logic (e.g., sync to monday.com)
	};

	const handleReset = () => {
		resetTimer();
		clearComment();
	};

	return (
		<Box className="timer-container" padding="large">
			<Flex direction="row" align="stretch" gap={32}>
				{/* Timer Display */}
				<Flex direction="row" align="center" justify="center" gap={16}>
					<RunningTimerDisplay activeSession={!!sessionId} isPaused={isPaused} elapsedTime={elapsedTime} resetTimer={handleReset} clearComment={clearComment} isSaving={isSaving} />
					<TimerActionButtons onClickStart={handleStart} onClickPause={handlePause} onClickResume={handleResume} onClickSaveAsDraft={handleSaveAsDraft} onClickSave={handleSave} activeSession={!!sessionId} isPaused={isPaused} isSaving={isSaving} />
				</Flex>
				{/* Comment Field */}
				<TimerCommentField setComment={setComment} comment={comment} activeSession={!!sessionId} />
			</Flex>
		</Box>
	);
}
