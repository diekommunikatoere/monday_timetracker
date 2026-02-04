// components/features/timer/TimerControls.tsx
"use client";

import { Flex, Tooltip } from "@mantine/core";
import { Icon, IconButton } from "@/components";
import type { TimerControlsProps } from "@/types/timer.types";

/**
 * TimerControls - Presentational component for timer action buttons
 *
 * This is a pure presentational component that:
 * - Receives all data and callbacks via props
 * - Has NO store access
 * - Only handles rendering
 *
 * @param status - Timer status (idle, running, paused)
 * @param hasSession - Whether there is an active timer session
 * @param hasComment - Whether there is a comment to save
 * @param isSaving - Whether a save operation is in progress
 * @param onPlayPause - Callback for play/pause button
 * @param onSaveAsDraft - Callback for save as draft button
 * @param onSave - Callback for save button (opens modal)
 */
export function TimerControls({ status, hasSession, hasComment, isSaving, onPlayPause, onSave }: TimerControlsProps) {
	const isRunning = status === "running";

	const activeColor = "var(--color--icon-on-primary)";
	const disabledColor = "var(--color--text-disabled)";

	// Determine which icon to show for play/pause button
	const PlayPauseIcon = isRunning ? <Icon name="pause" color={activeColor} size={21} /> : <Icon name="play" color={activeColor} size={21} />;

	return (
		<Flex direction="row" align="center" justify="center" gap="4px">
			<Tooltip label={isRunning ? "Timer pausieren" : "Timer starten"} position="top" withArrow>
				<IconButton variant="filled" colorVariant="primary" size="lg" onClick={onPlayPause} disabled={isSaving} loading={isSaving}>
					{PlayPauseIcon}
				</IconButton>
			</Tooltip>
			<Tooltip label="Speichern" position="top" withArrow>
				<IconButton variant="filled" colorVariant="primary" size="lg" onClick={onSave} disabled={!hasSession || isSaving} loading={isSaving}>
					<Icon name="save" color={hasSession ? activeColor : disabledColor} size={21} />
				</IconButton>
			</Tooltip>
		</Flex>
	);
}

export default TimerControls;
