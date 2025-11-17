"use client";

import { useState, useEffect, useRef } from "react";
import { useMondayContext } from "@/hooks/useMondayContext";
import { useTimerState } from "@/hooks/useTimerState";
import { useCommentFieldState } from "@/hooks/useCommentFieldState";
import { useDraftManualSave } from "@/hooks/useDraftManualSave";
import { Box, Flex } from "@vibe/core";
import RunningTimerDisplay from "@/components/RunningTimerDisplay";
import TimerActionButtons from "@/components/TimerActionButtons";
import TimerCommentField from "@/components/TimerCommentField";
import { supabase } from "@/lib/supabase/client";

export default function Timer() {
	const { elapsedTime, startTimer, pauseTimer, resetTimer, isRunning, isPaused, draftId } = useTimerState();
	const [initialComment, setInitialComment] = useState("");
	const { clearComment, setComment, comment } = useCommentFieldState(initialComment);
	const { saveDraft, isSaving } = useDraftManualSave(draftId, comment);

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
		startTimer();
	};

	const handlePause = () => {
		pauseTimer();
	};

	const handleResume = () => {
		pauseTimer();
	};

	const handleSaveAsDraft = () => {
		// Implement save as draft logic here
		console.log("Save as draft clicked");
		saveDraft();
	};

	const handleSave = () => {
		// Implement save logic here
	};

	const handleReset = () => {
		resetTimer();
		/* clearComment(); */
	};

	return (
		<Box className="timer-container" padding="large">
			<Flex direction="row" align="stretch" gap={32}>
				{/* Timer Display */}
				<Flex direction="row" align="center" justify="center" gap={16}>
					<RunningTimerDisplay isRunning={isRunning} isPaused={isPaused} elapsedTime={elapsedTime} resetTimer={handleReset} clearComment={clearComment} isSaving={isSaving} />
					<TimerActionButtons onClickStart={handleStart} onClickPause={handlePause} onClickResume={handleResume} onClickSaveAsDraft={handleSaveAsDraft} onClickSave={handleSave} isRunning={isRunning} isPaused={isPaused} isSaving={isSaving} />
				</Flex>
				{/* Comment Field */}
				<TimerCommentField setComment={setComment} comment={comment} isRunning={!isRunning} />
			</Flex>
		</Box>
	);
}
