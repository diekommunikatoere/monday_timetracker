// components/ui/forms/Input.tsx
// Text input and textarea wrappers with design-system validation styling.

"use client";

import { SegmentedControl as MantineSegmentedControl } from "@mantine/core";
import React from "react";

import styles from "@/components/styles/ui/inputs/SegmentedControl.module.css";

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
 * @returns A Mantine `TextInput` with design-system classes and a resolved error.
 */
export const SegmentedControl: React.FC<InputProps> = ({ className = "", ...props }) => {
	return <MantineSegmentedControl classNames={{ root: styles.segmentedControl, control: styles.control, input: styles.input, label: styles.label, indicator: styles.indicator, innerLabel: styles.innerLabel }} {...props} />;
};
