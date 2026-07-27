// components/ui/forms/Select.tsx
// Select dropdown wrapper with design-system validation styling.

"use client";

import { Select as MantineSelect } from "@mantine/core";
import React from "react";

import styles from "@/components/styles/ui/forms/Select.module.css";

import { defaultClearButtonProps } from "./clearButton";
import { SelectProps } from "./types";

/**
 * Dropdown select built on Mantine's `Select`.
 *
 * Applies a `select` base class plus an optional `select--<validationState>`
 * modifier and the caller's `className`. Resolves the design-system `error`
 * prop into Mantine's error slot: strings pass through verbatim, `true` falls
 * back to `"Ungültige Auswahl"`, and falsy values clear it. Defaults
 * `clearButtonProps` to the shared {@link defaultClearButtonProps} icon/style
 * so the clear button (shown when `clearable` is set) matches `Input`'s and
 * `DatePicker`'s; callers can override individual keys via `clearButtonProps`.
 * Note this default is inert unless the caller also passes `clearable` —
 * Mantine only renders the clear button when `clearable` is set.
 *
 * @param props                 - {@link SelectProps} for the dropdown.
 * @param props.validationState - When set, appends a state modifier class for styling.
 * @param props.error           - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className       - Extra classes appended after the base/modifier classes.
 * @param props.clearButtonProps - Merged over {@link defaultClearButtonProps}; only rendered when `clearable` is set.
 * @returns A Mantine `Select` with design-system classes and a resolved error.
 */
export const Select: React.FC<SelectProps> = ({ error, validationState, className = "", clearButtonProps, ...props }) => {
	const selectClass = [styles.select, validationState ? styles[`select--${validationState}`] : "", className].filter(Boolean).join(" ");

	return <MantineSelect classNames={{ input: selectClass, option: styles.selectOption }} error={typeof error === "string" ? error : error ? "Ungültige Auswahl" : null} clearButtonProps={{ ...defaultClearButtonProps, ...clearButtonProps }} {...props} />;
};
