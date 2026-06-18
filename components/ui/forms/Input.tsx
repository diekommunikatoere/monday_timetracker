// components/ui/forms/Input.tsx
// Text input and textarea wrappers with design-system validation styling.

"use client";

import React from "react";
import { TextInput as MantineTextInput, Textarea as MantineTextarea } from "@mantine/core";
import { InputProps, TextareaProps } from "./types";
import "@/components/styles/ui/forms/Input.module.css";

/**
 * Single-line text field built on Mantine's `TextInput`.
 *
 * Composes a `input` base class plus an optional `input--<validationState>`
 * modifier and the caller's `className`. Converts the design-system `error`
 * prop into Mantine's error slot: strings pass through verbatim, `true` falls
 * back to `"Invalid input"`, and falsy values clear it.
 *
 * @param props                - {@link InputProps} for the field.
 * @param props.validationState - When set, appends a state modifier class for styling.
 * @param props.error          - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className      - Extra classes appended after the base/modifier classes.
 * @returns A Mantine `TextInput` with design-system classes and a resolved error.
 */
export const Input: React.FC<InputProps> = ({ error, validationState, className = "", ...props }) => {
	const inputClass = ["input", validationState ? `input--${validationState}` : "", className].filter(Boolean).join(" ");

	return <MantineTextInput className={inputClass} error={typeof error === "string" ? error : error ? "Invalid input" : null} {...props} />;
};

/**
 * Multi-line text area built on Mantine's `Textarea`.
 *
 * Mirrors {@link Input}'s behavior — `textarea` base class, `textarea--<state>`
 * modifier, and the same `error` resolution (string verbatim, `true` →
 * `"Invalid input"`, falsy cleared).
 *
 * @param props                - {@link TextareaProps} for the field.
 * @param props.validationState - When set, appends a state modifier class for styling.
 * @param props.error          - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className      - Extra classes appended after the base/modifier classes.
 * @returns A Mantine `Textarea` with design-system classes and a resolved error.
 */
export const Textarea: React.FC<TextareaProps> = ({ error, validationState, className = "", ...props }) => {
	const textareaClass = ["textarea", validationState ? `textarea--${validationState}` : "", className].filter(Boolean).join(" ");

	return <MantineTextarea className={textareaClass} error={typeof error === "string" ? error : error ? "Invalid input" : null} {...props} />;
};
