// components/TimerCommentField.tsx
"use client";

import { useState } from "react";
import { Flex, TextInput } from "@mantine/core";
import type { TimerCommentFieldProps } from "@/types/timer.types";
import "@/public/css/components/TimerCommentField.css";

/**
 * TimerCommentField - Presentational component for comment input
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
export default function TimerCommentField({ value, onChange, disabled }: TimerCommentFieldProps) {
	// Local state for focus styling only
	const [isFocused, setIsFocused] = useState(false);

	const handleFocus = () => {
		setIsFocused(true);
	};

	const handleBlur = () => {
		setIsFocused(false);
	};

	return (
		<Flex direction="row" align="center" className="timer-comment-field-container" gap="sm">
			<TextInput className={`timer-comment-field${isFocused ? " focus" : ""}`} placeholder="Kommentar hinzufügen..." aria-label="Kommentar hinzufügen..." onChange={(event) => onChange(event.currentTarget.value)} onBlur={handleBlur} onFocus={handleFocus} value={value} disabled={disabled} style={{ flex: 1 }} />
		</Flex>
	);
}
