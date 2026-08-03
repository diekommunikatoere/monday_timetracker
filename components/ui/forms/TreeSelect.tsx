// components/ui/forms/TreeSelect.tsx
// Tree-structured select wrapper with design-system validation styling.

"use client";

import { TreeSelect as MantineTreeSelect } from "@mantine/core";
import React from "react";

import { defaultClearButtonProps } from "./clearButton";
import { TreeSelectProps } from "./types";

import styles from "@/components/styles/ui/forms/TreeSelect.module.css";

/**
 * Tree-structured dropdown built on Mantine's `TreeSelect`.
 *
 * Applies a `tree-select` base class plus an optional
 * `tree-select--<validationState>` modifier and the caller's `className`.
 * Resolves the design-system `error` prop into Mantine's error slot: strings
 * pass through verbatim, `true` falls back to `"Ungültige Auswahl"`, and
 * falsy values clear it. Defaults `clearButtonProps` to the shared
 * {@link defaultClearButtonProps} icon/style so the clear button (shown when
 * `clearable` is set) matches `Input`'s, `Select`'s, and `DatePicker`'s;
 * callers can override individual keys via `clearButtonProps`. Note this
 * default is inert unless the caller also passes `clearable`.
 *
 * @param props                  - {@link TreeSelectProps} for the dropdown.
 * @param props.validationState  - When set, appends a state modifier class for styling.
 * @param props.error            - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className        - Extra classes appended after the base/modifier classes.
 * @param props.clearButtonProps - Merged over {@link defaultClearButtonProps}; only rendered when `clearable` is set.
 * @returns A Mantine `TreeSelect` with design-system classes and a resolved error.
 */
export const TreeSelect: React.FC<TreeSelectProps> = ({ error, validationState, className = "", clearButtonProps, ...props }) => {
	const treeSelectClass = [styles["tree-select"], validationState ? styles[`tree-select--${validationState}`] : "", className].filter(Boolean).join(" ");

	return <MantineTreeSelect classNames={{ input: treeSelectClass, option: styles.selectOption }} error={typeof error === "string" ? error : error ? "Ungültige Auswahl" : null} clearButtonProps={{ ...defaultClearButtonProps, ...clearButtonProps }} {...props} />;
};
