// components/Timer.tsx
"use client";

import { Box, Flex } from "@mantine/core";
import { useTimer } from "@/hooks/useTimer";
import TimerDisplay from "@/components/TimerDisplay";
import TimerControls from "@/components/TimerControls";
import TimerCommentField from "@/components/TimerCommentField";

/**
 * Timer - Container component for the timer feature
 *
 * This is the smart container component that:
 * - Uses the useTimer hook to access all timer logic
 * - Passes data and callbacks down to presentational children
 *
 * Following Container/Presentational pattern:
 * - This component owns ALL the logic
 * - Child components are pure and receive props only
 *
 * Note: The SaveTimerModal is rendered in AppHeader.tsx to avoid duplicate modals
 */
export default function Timer() {
	// Get all timer state and actions from the unified hook
	const { state, actions, hasSession } = useTimer();

	// Determine play/pause action based on current status
	const handlePlayPause = () => {
		if (state.status === "idle" || state.status === "paused") {
			actions.start();
		} else {
			actions.pause();
		}
	};

	return (
		<Box className="timer-container" p="lg">
			<Flex direction="row" align="stretch" gap="xl">
				<Flex direction="row" align="center" justify="center" gap="md">
					{/* Timer Display - shows elapsed time and reset button */}
					<TimerDisplay elapsedTime={state.elapsedTime} status={state.status} onReset={actions.reset} disabled={!hasSession || state.isSaving} />

					{/* Timer Controls - play/pause, save as draft, save buttons */}
					<TimerControls status={state.status} hasSession={hasSession} isSaving={state.isSaving} onPlayPause={handlePlayPause} onSaveAsDraft={actions.saveAsDraft} onSave={actions.openSaveModal} />
				</Flex>

				{/* Comment Field */}
				<TimerCommentField value={state.comment} onChange={actions.updateComment} disabled={!hasSession} />
			</Flex>
		</Box>
	);
}
