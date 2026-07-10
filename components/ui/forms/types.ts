// components/ui/forms/types.ts
// Shared prop types for the form control design-system components.

import React from "react";
import { TextInputProps as MantineTextInputProps, TextareaProps as MantineTextareaProps, SelectProps as MantineSelectProps, TreeSelectProps as MantineTreeSelectProps } from "@mantine/core";
import { DatePickerInputProps, DatePickerType, TimeInputProps as MantineTimeInputProps } from "@mantine/dates";
import { TimePickerProps } from "@mantine/dates";

/**
 * Shared validation contract used by every form control in this folder.
 *
 * Each control extends its Mantine counterpart but **omits Mantine's `error`
 * prop** and re-adds it in a more permissive form. The wrapper components
 * translate this prop into the Mantine `error` slot at render time:
 *   - a `string`  → shown verbatim as the error message;
 *   - `true`      → a generic German fallback (`"Ungültige Eingabe"`, `"Ungültige Zeit"`, …);
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
	/** Shows a clear button (matching `Select`/`DatePicker`'s) in `rightSection` when there's a value. Mantine's `TextInput` has no native clear affordance, so this is built by hand — unlike `Select`/`DatePicker`, it renders whenever a value is present, since there's no separate Mantine gate to opt into. */
	clearable?: boolean;
	/** Called when the clear button is clicked. Required for `clearable` to do anything — this component doesn't own the value. */
	onClear?: () => void;
	/** Accessible label / tooltip text for the clear button. @default "Eingabe löschen" */
	clearButtonLabel?: string;
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
 * Props for the {@link TreeSelect} tree-structured dropdown.
 *
 * @property error           - Error message or flag (see shared contract above).
 * @property validationState - Visual validation state used to select a modifier class.
 */
export interface TreeSelectProps extends Omit<MantineTreeSelectProps, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
}

/**
 * Props for the {@link DatePicker} control.
 *
 * Generic over `Type` (`"default" | "multiple" | "range"`, same as Mantine's
 * `DatePickerInputProps`) so mode-specific props like `allowSingleDateInRange`
 * (range-only) and `allowDeselect` (default-only) resolve correctly instead of
 * collapsing to `never` under the implicit `Type = "default"` default.
 *
 * @property error           - Error message or flag (see shared contract above).
 * @property validationState - Visual validation state used to select a modifier class.
 */
export interface DatePickerProps<Type extends DatePickerType = "default"> extends Omit<DatePickerInputProps<Type>, "error"> {
	error?: string | boolean;
	validationState?: "error" | "warning" | "success";
}

/**
 * Props for the {@link TimeInput} control.
 *
 * Unlike {@link TimePickerComponentProps}, Mantine's `TimeInput` is already a
 * plain string-valued `<input type="time">` (`value`/`onChange` pass through
 * unchanged) — no Date-based signature to narrow.
 *
 * @property error           - Error message or flag (see shared contract above).
 * @property validationState - Visual validation state used to select a modifier class.
 */
export interface TimeInputProps extends Omit<MantineTimeInputProps, "error"> {
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
