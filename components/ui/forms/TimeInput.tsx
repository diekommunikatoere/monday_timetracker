// components/ui/forms/TimeInput.tsx
// Native time input wrapper with design-system validation styling.

"use client";

import { TimeInput as MantineTimeInput } from "@mantine/dates";
import React from "react";

import { TimeInputProps } from "./types";

import styles from "@/components/styles/ui/forms/TimeInput.module.css";

/**
 * Plain `<input type="time">` field built on Mantine's `TimeInput`.
 *
 * Applies a `time-input` base class plus an optional `time-input--<state>`
 * modifier and the caller's `className`. Resolves the design-system `error`
 * prop into Mantine's error slot: strings pass through verbatim, `true` falls
 * back to `"Ungültige Zeit"`, and falsy values clear it. Unlike `Select`/
 * `DatePicker`/`TreeSelect`, `TimeInput` has no native clear-button concept
 * (it's a plain input, not Combobox-based), so there is no `clearButtonProps`
 * here to default.
 *
 * @param props                 - {@link TimeInputProps} for the field.
 * @param props.validationState - When set, appends a state modifier class for styling.
 * @param props.error           - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className       - Extra classes appended after the base/modifier classes.
 * @returns A Mantine `TimeInput` with design-system classes and a resolved error.
 */
export const TimeInput: React.FC<TimeInputProps> = ({ error, validationState, className = "", ...props }) => {
	const timeInputClass = [styles["time-input"], validationState ? styles[`time-input--${validationState}`] : "", className].filter(Boolean).join(" ");

	return <MantineTimeInput classNames={{ input: timeInputClass }} error={typeof error === "string" ? error : error ? "Ungültige Zeit" : null} {...props} />;
};
