// components/TimerControls.tsx
"use client";

import { ActionIcon, Flex } from "@mantine/core";
import Play from "@/components/icons/Play";
import Pause from "@/components/icons/Pause";
import MoveDown from "@/components/icons/MoveDown";
import Save from "@/components/icons/Save";
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
	const disabledColor = "dki-tertiary";

	// Determine which icon to show for play/pause button
	const PlayPauseIcon = isRunning ? <Pause fillColor={activeColor} /> : <Play fillColor={activeColor} />;

	return (
		<Flex>
			<ActionIcon className="button button--timer play-pause" variant="filled" size="lg" onClick={onPlayPause} disabled={isSaving}>
				{PlayPauseIcon}
			</ActionIcon>
			<ActionIcon className="button button--timer draft" variant="filled" size="lg" onClick={onSaveAsDraft} disabled={!hasSession || isSaving}>
				<MoveDown fillColor={hasSession ? activeColor : disabledColor} />
			</ActionIcon>
			<ActionIcon className="button button--timer save" variant="filled" size="lg" onClick={onSave} disabled={!hasSession || isSaving}>
				<Save fillColor={hasSession ? activeColor : disabledColor} />
			</ActionIcon>
		</Flex>
	);
}
