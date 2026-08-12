// components/features/timer/TimerComment.tsx
"use client";

import { Flex, Tooltip } from "@mantine/core";
import { useState } from "react";

import { Icon, IconButton, Input } from "@/components";

import styles from "@/components/styles/features/timer/TimerCommentField.module.css";

import type { TimerCommentFieldProps } from "@/types/timer.types";

/**
 * `TimerComment` — presentational comment field shown next to the running timer.
 *
 * Pure / "dumb" component: it has **no store access** and receives all data and
 * callbacks via props (typed by {@link TimerCommentFieldProps}). The only local
 * state it keeps is `isFocused`, used purely to drive focus styling.
 *
 * The leading "save as draft" `IconButton` (clock icon) is the field's secondary
 * action; it stays disabled until a timer session exists and is not mid-save.
 * The text `Input` is bound to the comment string from the `useTimer` store via
 * {@link TimerContainer}.
 *
 * @param value        - Current comment text.
 * @param onChange     - Fired on every keystroke with the new string value.
 * @param disabled     - Disables the text input (e.g. when no session exists).
 * @param hasSession   - Whether an active timer session is present; gates the
 *                       save-as-draft button.
 * @param isSaving     - True while a save/draft request is in flight; shows the
 *                       loading spinner and disables the save button.
 * @param onSaveAsDraft- Invoked when the user clicks the clock icon to save the
 *                       current comment as a draft (see `actions.saveAsDraft`
 *                       from {@link useTimer}).
 * @returns A row containing the save-as-draft icon button and the comment input.
 */
export function TimerComment({ value, onChange, disabled, hasSession, isSaving, onSaveAsDraft }: TimerCommentFieldProps) {
	const renderSaveButton = () => {
		return (
			<Tooltip label="Als Entwurf speichern" position="bottom" withArrow>
				<IconButton variant="filled" colorVariant="primary" onClick={onSaveAsDraft} disabled={!hasSession || isSaving} loading={isSaving}>
					<Icon name="save_clock" size={18} />
				</IconButton>
			</Tooltip>
		);
	};

	return <Input classNames={{ root: styles.commentInput }} placeholder="Kommentar hinzufügen..." aria-label="Kommentar hinzufügen..." onChange={(event) => onChange(event.currentTarget.value)} value={value} disabled={disabled} rightSection={renderSaveButton()} />;
}

export default TimerComment;
