// components/ui/forms/Select.tsx
// Select dropdown wrapper with design-system validation styling.

"use client";

import React from "react";
import { Select as MantineSelect } from "@mantine/core";
import { SelectProps } from "./types";
import "@/components/styles/ui/forms/Select.module.css";

/**
 * Dropdown select built on Mantine's `Select`.
 *
 * Applies a `select` base class plus an optional `select--<validationState>`
 * modifier and the caller's `className`. Resolves the design-system `error`
 * prop into Mantine's error slot: strings pass through verbatim, `true` falls
 * back to `"Invalid selection"`, and falsy values clear it.
 *
 * @param props                 - {@link SelectProps} for the dropdown.
 * @param props.validationState - When set, appends a state modifier class for styling.
 * @param props.error           - String message or boolean flag; mapped to Mantine's `error`.
 * @param props.className       - Extra classes appended after the base/modifier classes.
 * @returns A Mantine `Select` with design-system classes and a resolved error.
 */
export const Select: React.FC<SelectProps> = ({ error, validationState, className = "", ...props }) => {
	const selectClass = ["select", validationState ? `select--${validationState}` : "", className].filter(Boolean).join(" ");

	return <MantineSelect className={selectClass} error={typeof error === "string" ? error : error ? "Invalid selection" : null} {...props} />;
};
