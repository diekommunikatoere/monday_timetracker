// components/features/timer/TimerContainer.tsx
"use client";

import { Box, Flex } from "@mantine/core";
import { useTimerContext } from "@/contexts/TimerContext";
import { TimerComment, TimerControls, TimerDisplay } from "@/components/features/timer";
import styles from "@/components/styles/features/timer/TimerContainer.module.css";

/**
 * `TimerContainer` — smart container for the live timer widget.
 *
 * This is the single "smart" component in the timer feature: it pulls all timer
 * state and actions from the {@link useTimer} hook (exposed via the
 * `TimerContext` through {@link useTimerContext}) and fans them out to three
 * pure presentational children:
 *  - {@link TimerDisplay} — elapsed time + reset button.
 *  - {@link TimerControls} — play/pause + save buttons.
 *  - {@link TimerComment} — comment input + save-as-draft button.
 *
 * Following the container/presentational split, this component owns **all** the
 * logic (e.g. mapping `status` to the right `start`/`pause`/`resume` action in
 * `handlePlayPause`) and the children only render props.
 *
 * Note: the `SaveTimerModal` / `EmptyCommentConfirmationModal` are intentionally
 * **not** rendered here — they live in `TimerDashboardHeader.tsx` so a single
 * instance is mounted per dashboard.
 *
 * @returns A styled box laying out the timer display, controls, and comment field.
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
