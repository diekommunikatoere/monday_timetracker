// components/features/timer/TimerControls.tsx
"use client";

import { Tooltip } from "@mantine/core";
import { IconButton, ButtonGroup } from "@/components";

import { Icon } from "@/components";
import type { TimerControlsProps } from "@/types/timer.types";
import styles from "@/components/styles/features/timer/TimerControls.module.css";

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
export function TimerControls({ status, hasSession, hasComment, isSaving, onPlayPause, onSaveAsDraft, onSave }: TimerControlsProps) {
	const isRunning = status === "running";

	const activeColor = "white";
	const disabledColor = "var(--color--tertiary)";

	// Determine which icon to show for play/pause button
	const PlayPauseIcon = isRunning ? <Icon name="pause" color={activeColor} /> : <Icon name="play" color={activeColor} />;

	return (
		<ButtonGroup>
			<Tooltip label={isRunning ? "Timer pausieren" : "Timer starten"} position="top" withArrow>
				<IconButton className={`button button--timer play-pause ${styles.timerIconButton}`} variant="filled" size="xl" onClick={onPlayPause} disabled={isSaving} loading={isSaving}>
					{PlayPauseIcon}
				</IconButton>
			</Tooltip>
			<Tooltip label="Als Entwurf speichern" position="top" withArrow>
				<IconButton className={`button button--timer draft" ${styles.timerIconButton}`} variant="filled" size="xl" onClick={onSaveAsDraft} disabled={!hasSession || /* !hasComment || */ isSaving} loading={isSaving}>
					<Icon name="moveDown" color={hasSession ? activeColor : disabledColor} />
				</IconButton>
			</Tooltip>
			<Tooltip label="Speichern" position="top" withArrow>
				<IconButton className={`button button--timer save ${styles.timerIconButton}`} variant="filled" size="xl" onClick={onSave} disabled={!hasSession || isSaving} loading={isSaving}>
					<Icon name="save" color={hasSession ? activeColor : disabledColor} />
				</IconButton>
			</Tooltip>
		</ButtonGroup>
	);
}

export default TimerControls;
