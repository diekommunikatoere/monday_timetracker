import { formatTime } from "@/lib/utils";
import { useTimerState } from "@/hooks/useTimerState";
import { useCommentFieldState } from "@/hooks/useCommentFieldState";
import { Flex, Text, Button } from "@vibe/core";
import { Retry } from "@vibe/icons";
import Reset from "@/components/icons/Reset";

import "@/public/css/components/RunningTimerDisplay.css";

export default function RunningTimerDisplay({ resetTimer, clearComment, activeSession, isPaused, elapsedTime, isSaving, ...props }) {
	const handleTimerReset = () => {
		resetTimer();
		clearComment();
	};

	const resetIcon = <Reset fillColor={activeSession ? "var(--color--text-on-primary)" : "var(--color--text-disabled)"} />;

	return (
		<Flex direction="row" align="center" justify="center" className="timer-display" gap="medium" {...props}>
			<Text className={`timer-time${activeSession ? " active" : ""}${isPaused ? " paused" : ""}`} type="text1" weight="bold">
				{formatTime(elapsedTime)}
			</Text>
			<Button className="btn-reset" onClick={handleTimerReset} kind="primary" size="small" ariaLabel="Timer zurücksetzen" disabled={!activeSession || isSaving}>
				{resetIcon}
			</Button>
		</Flex>
	);
}
