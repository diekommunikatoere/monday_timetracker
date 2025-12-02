// components/TimerDisplay.tsx
"use client";

import { Flex, Text, Button, ActionIcon } from "@mantine/core";
import { formatTime } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import type { TimerDisplayProps } from "@/types/timer.types";
import "@/public/css/components/RunningTimerDisplay.css";

/**
 * TimerDisplay - Presentational component for displaying elapsed time
 *
 * This is a pure presentational component that:
 * - Receives all data via props
 * - Has NO store access
 * - Only handles rendering and local UI state
 *
 * @param elapsedTime - Time in milliseconds to display
 * @param status - Timer status (idle, running, paused)
 * @param onReset - Callback when reset button is clicked
 * @param disabled - Whether the reset button should be disabled
 */
export default function TimerDisplay({ elapsedTime, status, onReset, disabled }: TimerDisplayProps) {
	const isActive = status !== "idle";
	const isPaused = status === "paused";

	const activeColor = "white";
	const disabledColor = "var(--color--tertiary)";

	return (
		<Flex direction="row" align="center" justify="center" className="timer-display" gap="md">
			<Text className={`timer-time${isActive ? " active" : ""}${isPaused ? " paused" : ""}`}>{formatTime(elapsedTime)}</Text>
			<ActionIcon className="btn-reset" onClick={onReset} variant="filled" size="lg" aria-label="Timer zurücksetzen" disabled={disabled}>
				<Icon name="reset" color={!disabled ? activeColor : disabledColor} />
			</ActionIcon>
		</Flex>
	);
}
