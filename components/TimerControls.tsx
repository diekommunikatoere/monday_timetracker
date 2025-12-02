// components/TimerControls.tsx
"use client";

import { ActionIcon, Flex, Tooltip } from "@mantine/core";
import { Icon } from "@/components/Icon";
import type { TimerControlsProps } from "@/types/timer.types";
import "@/public/css/components/TimerActionButtons.css";

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
 * @param isSaving - Whether a save operation is in progress
 * @param onPlayPause - Callback for play/pause button
 * @param onSaveAsDraft - Callback for save as draft button
 * @param onSave - Callback for save button (opens modal)
 */
export default function TimerControls({ status, hasSession, isSaving, onPlayPause, onSaveAsDraft, onSave }: TimerControlsProps) {
	const isRunning = status === "running";

	const activeColor = "white";
	const disabledColor = "var(--color--tertiary)";

	// Determine which icon to show for play/pause button
	const PlayPauseIcon = isRunning ? <Icon name="pause" color={activeColor} /> : <Icon name="play" color={activeColor} />;

	return (
		<Flex>
			<Tooltip label={isRunning ? "Timer pausieren" : "Timer starten"} position="top" withArrow>
				<ActionIcon className="button button--timer play-pause" variant="filled" size="lg" onClick={onPlayPause} disabled={isSaving}>
					{PlayPauseIcon}
				</ActionIcon>
			</Tooltip>
			<Tooltip label="Als Entwurf speichern" position="top" withArrow>
				<ActionIcon className="button button--timer draft" variant="filled" size="lg" onClick={onSaveAsDraft} disabled={!hasSession || isSaving}>
					<Icon name="moveDown" color={hasSession ? activeColor : disabledColor} />
				</ActionIcon>
			</Tooltip>
			<Tooltip label="Speichern" position="top" withArrow>
				<ActionIcon className="button button--timer save" variant="filled" size="lg" onClick={onSave} disabled={!hasSession || isSaving}>
					<Icon name="save" color={hasSession ? activeColor : disabledColor} />
				</ActionIcon>
			</Tooltip>
		</Flex>
	);
}
