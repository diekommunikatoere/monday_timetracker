// components/ui/forms/Input.tsx
// Text input and textarea wrappers with design-system validation styling.

"use client";

import React from "react";
import { Tooltip, TextInput as MantineTextInput, Textarea as MantineTextarea } from "@mantine/core";
import { InputProps, TextareaProps } from "./types";
import styles from "@/components/styles/ui/forms/Input.module.css";
import { IconButton } from "../buttons/IconButton";
import { Icon } from "../icons";

/**
 * Single-line text field built on Mantine's `TextInput`.
 *
 * Composes a `input` base class plus an optional `input--<validationState>`
 * modifier and the caller's `className`. Converts the design-system `error`
 * prop into Mantine's error slot: strings pass through verbatim, `true` falls
 * back to `"Ungültige Eingabe"`, and falsy values clear it.
 *
 * Plain `TextInput` has no native clear-button concept (unlike `Select`/
 * `DatePicker`, which are Combobox-based), so `clearable` is a design-system
 * addition: when set and `value` is non-empty, it renders the same
 * tertiary `IconButton` + close icon into `rightSection`, wrapped in a
 * `Tooltip`. Falls back to the caller's own `rightSection` otherwise.
 *
 * @param props                 - {@link InputProps} for the field.
 * @param props.validationState - When set, appends a state modifier class for styling.
 * @param props.error           - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className       - Extra classes appended after the base/modifier classes.
 * @param props.clearable       - Shows the clear button in `rightSection` when `value` is non-empty.
 * @param props.onClear         - Click handler for the clear button; required for `clearable` to do anything.
 * @param props.clearButtonLabel - Aria-label / tooltip text for the clear button.
 * @returns A Mantine `TextInput` with design-system classes and a resolved error.
 */
export const Input: React.FC<InputProps> = ({ error, validationState, className = "", clearable, onClear, clearButtonLabel = "Eingabe löschen", rightSection, rightSectionPointerEvents, value, ...props }) => {
	const inputClass = [styles.input, validationState ? styles[`input--${validationState}`] : "", className].filter(Boolean).join(" ");
	const showClearButton = clearable && !!value;

	return (
		<MantineTextInput
			classNames={{ input: inputClass }}
			error={typeof error === "string" ? error : error ? "Ungültige Eingabe" : null}
			value={value}
			rightSection={
				showClearButton ? (
					<Tooltip label={clearButtonLabel} position="top" withArrow openDelay={400}>
						<IconButton onClick={onClear} colorVariant="tertiary" aria-label={clearButtonLabel} size="sm">
							<Icon name="close" size={16} />
						</IconButton>
					</Tooltip>
				) : (
					rightSection
				)
			}
			rightSectionPointerEvents={showClearButton ? "auto" : rightSectionPointerEvents}
			{...props}
		/>
	);
};

/**
 * Multi-line text area built on Mantine's `Textarea`.
 *
 * Mirrors {@link Input}'s behavior — `textarea` base class, `textarea--<state>`
 * modifier, and the same `error` resolution (string verbatim, `true` →
 * `"Ungültige Eingabe"`, falsy cleared).
 *
 * @param props                - {@link TextareaProps} for the field.
 * @param props.validationState - When set, appends a state modifier class for styling.
 * @param props.error          - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className      - Extra classes appended after the base/modifier classes.
 * @returns A Mantine `Textarea` with design-system classes and a resolved error.
 */
export const Textarea: React.FC<TextareaProps> = ({ error, validationState, className = "", ...props }) => {
	const textareaClass = [styles.textarea, validationState ? styles[`textarea--${validationState}`] : "", className].filter(Boolean).join(" ");

	return <MantineTextarea classNames={{ input: textareaClass }} error={typeof error === "string" ? error : error ? "Ungültige Eingabe" : null} {...props} />;
};
