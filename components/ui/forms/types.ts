// components/ui/forms/types.ts
// Shared prop types for the form control design-system components.

import React from "react";
import { TextInputProps as MantineTextInputProps, TextareaProps as MantineTextareaProps, SelectProps as MantineSelectProps } from "@mantine/core";
import { DatePickerInputProps } from "@mantine/dates";
import { TimePickerProps } from "@mantine/dates";

/**
 * Shared validation contract used by every form control in this folder.
 *
 * Each control extends its Mantine counterpart but **omits Mantine's `error`
 * prop** and re-adds it in a more permissive form. The wrapper components
 * translate this prop into the Mantine `error` slot at render time:
 *   - a `string`  → shown verbatim as the error message;
 *   - `true`      → a generic localized fallback (`"Invalid input"`, `"Invalid time"`, …);
 *   - `false`/`undefined` → no error shown.
 *
 * `validationState` is the design-system flag that toggles the `--<state>`
 * modifier class (e.g. `input--error`) for border/feedback styling, independent
 * of the message. Allowed values: `"error"`, `"warning"`, `"success"`.
 */

/**
 * Props for the {@link Input} text field.
 *
 * @property error           - Error message or flag (see shared contract above).
 * @property validationState - Visual validation state used to select a modifier class.
 */
export interface InputProps extends Omit<MantineTextInputProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
}

/**
 * Props for the {@link Textarea} multi-line field.
 *
 * @property error           - Error message or flag (see shared contract above).
 * @property validationState - Visual validation state used to select a modifier class.
 */
export interface TextareaProps extends Omit<MantineTextareaProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
}

/**
 * Props for the {@link Select} dropdown.
 *
 * @property error           - Error message or flag (see shared contract above).
 * @property validationState - Visual validation state used to select a modifier class.
 */
export interface SelectProps extends Omit<MantineSelectProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
}

/**
 * Props for the {@link DatePicker} control.
 *
 * @property error           - Error message or flag (see shared contract above).
 * @property validationState - Visual validation state used to select a modifier class.
 */
export interface DatePickerProps extends Omit<DatePickerInputProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
}

/**
 * Props for the {@link TimePicker} control.
 *
 * Narrows Mantine's `TimePickerProps` to a string-based value/handler pair
 * (instead of Mantine's `Date`-based signature) to keep the time tracker's
 * form state stringly-typed.
 *
 * @property error           - Error message or flag (see shared contract above).
 * @property validationState - Visual validation state used to select a modifier class.
 * @property value           - Current time value as a string (e.g. `"HH:mm"`).
 * @property onChange        - Callback invoked with the new string time value.
 */
export interface TimePickerComponentProps extends Omit<TimePickerProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
	value?: string;
	onChange?: (value: string) => void;
}
