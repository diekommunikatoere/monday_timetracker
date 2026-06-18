// components/ui/forms/TimePicker.tsx
// Time picker wrapper with design-system validation styling.

"use client";

import React from "react";
import { TimePicker as MantineTimePicker } from "@mantine/dates";
import { TimePickerComponentProps } from "./types";
import "@/components/styles/ui/forms/TimePicker.module.css";

/**
 * Time field built on Mantine's `TimePicker`.
 *
 * Applies a `time-picker` base class plus an optional `time-picker--<state>`
 * modifier and the caller's `className`. Resolves the design-system `error`
 * prop into Mantine's error slot: strings pass through verbatim, `true` falls
 * back to `"Invalid time"`, and falsy values clear it. The string-based
 * `value`/`onChange` pair is forwarded directly (see {@link TimePickerComponentProps}).
 *
 * @param props                 - {@link TimePickerComponentProps} for the field.
 * @param props.value           - Current time as a string (e.g. `"HH:mm"`).
 * @param props.onChange        - Callback receiving the new string time value.
 * @param props.validationState - When set, appends a state modifier class for styling.
 * @param props.error           - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className       - Extra classes appended after the base/modifier classes.
 * @returns A Mantine `TimePicker` with design-system classes and a resolved error.
 */
export const TimePicker: React.FC<TimePickerComponentProps> = ({ error, validationState, className = "", value, onChange, ...props }) => {
	const timePickerClass = ["time-picker", validationState ? `time-picker--${validationState}` : "", className].filter(Boolean).join(" ");

	return <MantineTimePicker className={timePickerClass} value={value} onChange={onChange} error={typeof error === "string" ? error : error ? "Invalid time" : null} {...props} />;
};
