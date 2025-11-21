// components/Timer.tsx
"use client";

import { useTimerStore } from "@/stores/timerStore";
import { useDraftStore } from "@/stores/draftStore";
import { useUserStore } from "@/stores/userStore";
import { useTimerStateSSR } from "@/hooks/useTimerState";
import { Box, Flex } from "@vibe/core";
import RunningTimerDisplay from "@/components/RunningTimerDisplay";
import TimerActionButtons from "@/components/TimerActionButtons";
import TimerCommentField from "@/components/TimerCommentField";

export default function Timer({ onSave }: { onSave: () => void }) {
	const { elapsedTime, startTimer, pauseTimer, resetTimer, softResetTimer, isPaused, draftId, sessionId, comment, isSaving } = useTimerStateSSR();

	const { saveDraft } = useDraftStore();
	const { updateComment, clearComment } = useTimerStore.getState();
	const supabaseUser = useUserStore((state) => state.supabaseUser);

	const handleStart = () => {
		startTimer();
	};

	const handlePause = () => {
		pauseTimer();
	};

	const handleResume = () => {
		startTimer();
	};

	const handleSaveAsDraft = async () => {
		if (draftId && supabaseUser?.id) {
			await saveDraft({
				draftId,
				userProfileId: supabaseUser.id,
				comment: comment,
			});
		}
		softResetTimer();
	};

	const handleSave = () => {
		if (!isPaused) {
			pauseTimer();
		}
		onSave();
	};

	const handleReset = () => {
		resetTimer();
		clearComment();
	};

	return (
		<Box className="timer-container" padding="large">
			<Flex direction="row" align="stretch" gap={32}>
				<Flex direction="row" align="center" justify="center" gap={16}>
					<RunningTimerDisplay activeSession={!!sessionId} isPaused={isPaused} elapsedTime={elapsedTime} resetTimer={handleReset} clearComment={clearComment} isSaving={isSaving} />
					<TimerActionButtons onClickStart={handleStart} onClickPause={handlePause} onClickResume={handleResume} onClickSaveAsDraft={handleSaveAsDraft} onClickSave={handleSave} activeSession={!!sessionId} isPaused={isPaused} isSaving={isSaving} />
				</Flex>
				<TimerCommentField setComment={updateComment} comment={comment} activeSession={!!sessionId} />
			</Flex>
		</Box>
	);
}
