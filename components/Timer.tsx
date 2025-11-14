"use client";

import { useState, useEffect, useRef } from "react";
import { useMondayContext } from "@/hooks/useMondayContext";
import { useTimerState } from "@/hooks/useTimerState";
import { useCommentFieldState } from "@/hooks/useCommentFieldState";
import { Box, Flex } from "@vibe/core";
import RunningTimerDisplay from "@/components/RunningTimerDisplay";
import TimerActionButtons from "@/components/TimerActionButtons";
import TimerCommentField from "@/components/TimerCommentField";
import { supabase } from "@/lib/supabase/client";

export default function Timer() {
	const { elapsedTime, startTimer, pauseTimer, resetTimer, isRunning, isPaused, draftId } = useTimerState();
	const [initialComment, setInitialComment] = useState("");
	const { clearComment, setComment, comment } = useCommentFieldState(initialComment);

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
		console.log("Timer started");
		startTimer();
	};

	const handlePause = () => {
		console.log("Timer paused");
		pauseTimer();
	};

	const handleResume = () => {
		console.log("Timer resumed");
		pauseTimer();
	};

	const handleDraft = () => {
		console.log("Draft action triggered");
		// Implement draft logic here
	};

	const handleSave = () => {
		console.log("Save action triggered");
		// Implement save logic here
	};

	const handleReset = () => {
		console.log("Reset action triggered");
		resetTimer();
		/* clearComment(); */
	};

	return (
		<Box className="timer-container" padding="large">
			<Flex direction="row" align="stretch" gap={32}>
				{/* Timer Display */}
				<Flex direction="row" align="center" justify="center" gap={16}>
					<RunningTimerDisplay isRunning={isRunning} isPaused={isPaused} elapsedTime={elapsedTime} resetTimer={handleReset} clearComment={clearComment} />
					<TimerActionButtons onClickStart={handleStart} onClickPause={handlePause} onClickResume={handleResume} onClickDraft={handleDraft} onClickSave={handleSave} isRunning={isRunning} isPaused={isPaused} />
				</Flex>
				{/* Comment Field */}
				<TimerCommentField setComment={setComment} comment={comment} isRunning={!isRunning} />
			</Flex>
		</Box>
	);
}
