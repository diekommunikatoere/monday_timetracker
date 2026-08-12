// components/features/timer/TimerControls.tsx
"use client";

import { Flex, Tooltip } from "@mantine/core";

import { Icon, IconButton } from "@/components";

import type { TimerControlsProps } from "@/types/timer.types";

/**
 * `TimerControls` — presentational row of timer action buttons.
 *
 * Pure / "dumb" component with **no store access**; all data and callbacks
 * arrive via props (typed by {@link TimerControlsProps}). It renders exactly
 * two `IconButton`s: a play/pause toggle (icon depends on {@link TimerStatus})
 * and a save button that opens the save modal via `onSave`.
 *
 * Note: this component does **not** expose a save-as-draft action — that lives
 * in {@link TimerComment}. The two action clusters are kept separate so the
 * save/draft semantics stay close to the inputs they relate to.
 *
 * @param status     - Current timer status; `"running"` shows the pause icon,
 *                     anything else shows the play icon.
 * @param hasSession- Whether an active timer session is present; gates the
 *                     save button (disabled when there is nothing to save).
 * @param hasComment - Whether a non-empty comment exists (forwarded from the
 *                     container; reserved for future affordances).
 * @param isSaving  - True while a save request is in flight; shows loading
 *                     spinners and disables both buttons.
 * @param onPlayPause- Fired by the play/pause button. The container maps this
 *                     to `actions.start` / `actions.pause` / `actions.resume`
 *                     depending on the current status.
 * @param onSave    - Fired by the save button to open the save modal
 *                     (`actions.openSaveModal` from {@link useTimer}).
 * @returns A row containing the play/pause and save buttons.
 */
export function TimerControls({ status, hasSession, hasComment, isSaving, onPlayPause, onSave }: TimerControlsProps) {
	const isRunning = status === "running";

	const activeColor = "var(--color--icon-on-primary)";
	const disabledColor = "var(--color--text-disabled)";

	// Determine which icon to show for play/pause button
	const PlayPauseIcon = isRunning ? <Icon name="pause" size={21} /> : <Icon name="play_arrow" size={21} />;

	return (
		<Flex direction="row" align="center" justify="center" gap="4px">
			<Tooltip label={isRunning ? "Timer pausieren" : "Timer starten"} position="top" withArrow>
				<IconButton variant="filled" colorVariant="primary" size="lg" onClick={onPlayPause} disabled={isSaving} loading={isSaving}>
					{PlayPauseIcon}
				</IconButton>
			</Tooltip>
			<Tooltip label="Speichern" position="top" withArrow>
				<IconButton variant="filled" colorVariant="primary" size="lg" onClick={onSave} disabled={!hasSession || isSaving} loading={isSaving}>
					<Icon name="save" size={21} />
				</IconButton>
			</Tooltip>
		</Flex>
	);
}

export default TimerControls;
