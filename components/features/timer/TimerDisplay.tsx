// components/features/timer/TimerDisplay.tsx
"use client";

import { Flex, Text, Tooltip } from "@mantine/core";
import { IconButton } from "@/components";
import { Icon } from "@/components/ui/icons";
import { formatTime } from "@/lib/utils";
import type { TimerDisplayProps } from "@/types/timer.types";
import styles from "@/components/styles/features/timer/TimerDisplay.module.css";

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
export function TimerDisplay({ elapsedTime, status, onReset, disabled }: TimerDisplayProps) {
	const isActive = status !== "idle";
	const isPaused = status === "paused";

	const activeColor = "var(--color--text-on-primary)";
	const disabledColor = "var(--color--text-disabled)";

	return (
		<Flex direction="row" align="center" justify="center" gap="lg">
			<Tooltip label="Timer zurücksetzen" position="top" withArrow>
				<IconButton className="btn-reset" onClick={onReset} variant="filled" size="xl" aria-label="Timer zurücksetzen" disabled={disabled}>
					<Icon name="reset" color={!disabled ? activeColor : disabledColor} />
				</IconButton>
			</Tooltip>
			<Text className={`${styles.time} ${isActive ? styles.isActive : ""} ${isPaused ? styles.isPaused : ""}`}>{formatTime(elapsedTime)}</Text>
		</Flex>
	);
}

export default TimerDisplay;
