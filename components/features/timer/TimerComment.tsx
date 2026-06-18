// components/features/timer/TimerComment.tsx
"use client";

import { useState } from "react";
import { Flex, Tooltip } from "@mantine/core";
import { Icon, IconButton, Input } from "@/components";
import type { TimerCommentFieldProps } from "@/types/timer.types";
import styles from "@/components/styles/features/timer/TimerCommentField.module.css";

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
	// Local state for focus styling only
	const [isFocused, setIsFocused] = useState(false);

	const handleFocus = () => {
		setIsFocused(true);
	};

	const handleBlur = () => {
		setIsFocused(false);
	};

	const activeColor = "white";
	const disabledColor = "var(--color--text-disabled)";

	return (
		<Flex direction="row" align="center" className="timer-comment-field-container" gap="0" style={{ flex: 1 }}>
			<Tooltip label="Als Entwurf speichern" position="top" withArrow>
				<IconButton variant="filled" colorVariant="primary" size="lg" onClick={onSaveAsDraft} disabled={!hasSession || isSaving} loading={isSaving} style={{ borderRadius: "var(--border-radius-small) 0 0 var(--border-radius-small)", height: "100%", width: "auto" }}>
					<Icon name="saveClock" size={21} />
				</IconButton>
			</Tooltip>
			<Input classNames={styles} placeholder="Kommentar hinzufügen..." aria-label="Kommentar hinzufügen..." onChange={(event) => onChange(event.currentTarget.value)} onBlur={handleBlur} onFocus={handleFocus} value={value} disabled={disabled} style={{ flex: 1, minWidth: "clamp(min(200px, 100vw), 25vw, 450px)" }} />
		</Flex>
	);
}

export default TimerComment;
