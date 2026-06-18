// components/ui/forms/DatePicker.tsx
// Date picker wrapper with design-system validation styling.

"use client";

import React from "react";
import { DatePickerInput as MantineDatePickerInput } from "@mantine/dates";
import { DatePickerProps } from "./types";
import "@/components/styles/ui/forms/DatePicker.module.css";

/**
 * Date field built on Mantine's `DatePickerInput`.
 *
 * Applies a `date-picker` base class plus an optional `date-picker--<state>`
 * modifier and the caller's `className`. Resolves the design-system `error`
 * prop into Mantine's error slot: strings pass through verbatim, `true` falls
 * back to `"Invalid date"`, and falsy values clear it.
 *
 * @param props                 - {@link DatePickerProps} for the field.
 * @param props.validationState - When set, appends a state modifier class for styling.
 * @param props.error           - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className       - Extra classes appended after the base/modifier classes.
 * @returns A Mantine `DatePickerInput` with design-system classes and a resolved error.
 */
export const DatePicker: React.FC<DatePickerProps> = ({ error, validationState, className = "", ...props }) => {
	const datePickerClass = ["date-picker", validationState ? `date-picker--${validationState}` : "", className].filter(Boolean).join(" ");

	return <MantineDatePickerInput className={datePickerClass} error={typeof error === "string" ? error : error ? "Invalid date" : null} {...props} />;
};
