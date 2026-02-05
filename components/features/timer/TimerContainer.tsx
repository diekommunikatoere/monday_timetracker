// components/features/timer/TimerContainer.tsx
"use client";

import { Box, Flex } from "@mantine/core";
import { useTimerContext } from "@/contexts/TimerContext";
import { TimerComment, TimerControls, TimerDisplay } from "@/components/features/timer";
import styles from "@/components/styles/features/timer/TimerContainer.module.css";

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
 * Note: The SaveTimerModal is rendered in TimerDashboardHeader.tsx to avoid duplicate modals
 */
export function TimerContainer() {
	// Get all timer state and actions from the unified hook
	const { state, actions, hasSession } = useTimerContext();

	// Determine play/pause action based on current status
	const handlePlayPause = () => {
		if (state.status === "running") {
			actions.pause();
		} else if (state.status === "paused") {
			actions.resume();
		} else {
			actions.start();
		}
	};

	return (
		<Box className={styles.timerContainer}>
			<Flex direction="row" align="stretch" justify="stretch" columnGap="xl" rowGap="sm" wrap={"wrap"}>
				<Flex direction="row" align="stretch" justify="center" gap="lg">
					{/* Timer Display - shows elapsed time and reset button */}
					<TimerDisplay elapsedTime={state.elapsedTime} status={state.status} onReset={actions.reset} disabled={!hasSession || state.isSaving} />

					{/* Timer Controls - play/pause, save as draft, save buttons */}
					<TimerControls status={state.status} hasSession={hasSession} hasComment={!!state.comment} isSaving={state.isSaving} onPlayPause={handlePlayPause} onSave={actions.openSaveModal} />
				</Flex>

				{/* Comment Field */}
				<TimerComment value={state.comment} onChange={actions.updateComment} disabled={!hasSession} hasSession={hasSession} isSaving={state.isSaving} onSaveAsDraft={actions.saveAsDraft} />
			</Flex>
		</Box>
	);
}

export default TimerContainer;
