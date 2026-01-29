// components/features/timer/TimerComment.tsx
"use client";

import { useState } from "react";
import { Flex, Tooltip } from "@mantine/core";
import { Icon, IconButton, Input } from "@/components";
import type { TimerCommentFieldProps } from "@/types/timer.types";
import "@/components/styles/features/timer/TimerCommentField.css";

/**
 * TimerComment - Presentational component for comment input
 *
 * This is a pure presentational component that:
 * - Receives all data and callbacks via props
 * - Has NO store access
 * - Only handles rendering and local focus state
 *
 * @param value - Current comment value
 * @param onChange - Callback when comment changes
 * @param disabled - Whether the input should be disabled
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
	const disabledColor = "var(--color--tertiary)";

	return (
		<Flex direction="row" align="center" className="timer-comment-field-container" gap="0">
			<Tooltip label="Als Entwurf speichern" position="top" withArrow>
				<IconButton className={`button button--timer draft timer-icon-button`} variant="filled" size="lg" onClick={onSaveAsDraft} disabled={!hasSession || isSaving} loading={isSaving}>
					<Icon name="archive" color={hasSession ? activeColor : disabledColor} size={21} />
				</IconButton>
			</Tooltip>
			<Input className={`timer-comment-field ${isFocused ? " focus" : ""}`} placeholder="Kommentar hinzufügen..." aria-label="Kommentar hinzufügen..." onChange={(event) => onChange(event.currentTarget.value)} onBlur={handleBlur} onFocus={handleFocus} value={value} disabled={disabled} style={{ flex: 1 }} />
		</Flex>
	);
}

export default TimerComment;
