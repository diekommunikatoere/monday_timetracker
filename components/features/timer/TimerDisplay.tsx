// components/features/timer/TimerDisplay.tsx
"use client";

import { Flex, Text, Tooltip } from "@mantine/core";

import { Icon, IconButton } from "@/components";
import { formatTime } from "@/lib/utils";

import styles from "@/components/styles/features/timer/TimerDisplay.module.css";

import type { TimerDisplayProps } from "@/types/timer.types";

/**
 * `TimerDisplay` — presentational read-out of elapsed time plus a reset button.
 *
 * Pure / "dumb" component with **no store access**; all data arrives via props
 * (typed by {@link TimerDisplayProps}). The elapsed time is rendered through
 * {@link formatTime}, which formats an `HH:MM:SS` string.
 *
 * **Unit gotcha:** despite `formatTime`'s parameter being named `seconds`, it
 * actually expects **milliseconds** (it divides by 1000 internally). The
 * `elapsedTime` prop therefore must be milliseconds — which it is, as the
 * `useTimer` store holds ms (the Supabase RPC returns `elapsed_time_ms` and the
 * local tick adds `Date.now() - syncedAt`). The CSS modifiers `.isActive` and
 * `.isPaused` toggle styling based on {@link TimerStatus}.
 *
 * @param elapsedTime - Elapsed time in **milliseconds** to display.
 * @param status      - Current timer status; drives the active/paused CSS state.
 * @param onReset     - Fired when the reset button is clicked
 *                      (`actions.reset` from {@link useTimer}).
 * @param disabled    - Disables the reset button (e.g. when no session or mid-save).
 * @returns A row containing the reset icon button and the formatted time text.
 */
export function TimerDisplay({ elapsedTime, status, onReset, disabled }: TimerDisplayProps) {
	const isActive = status !== "idle";
	const isPaused = status === "paused";

	return (
		<Flex className={styles.timerDisplay} direction="row" align="center" justify="center" gap={8}>
			<Tooltip label="Timer zurücksetzen" position="top" withArrow>
				<IconButton className={`timer--reset btn-reset ${styles.timerResetButton}`} onClick={onReset} variant="filled" colorVariant="primary" size="lg" aria-label="Timer zurücksetzen" disabled={disabled}>
					<Icon name="restart_alt" size={24} />
				</IconButton>
			</Tooltip>
			<Text className={`${styles.timerTime} ${isActive ? styles.isActive : ""} ${isPaused ? styles.isPaused : ""}`}>{formatTime(elapsedTime)}</Text>
		</Flex>
	);
}

export default TimerDisplay;
