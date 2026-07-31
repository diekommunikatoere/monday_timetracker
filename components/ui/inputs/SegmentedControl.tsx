// components/ui/inputs/SegmentedControl.tsx
// Segmented control wrapper with design-system styling.

"use client";

import { SegmentedControl as MantineSegmentedControl, SegmentedControlProps } from "@mantine/core";
import React from "react";

import styles from "@/components/styles/ui/inputs/SegmentedControl.module.css";

/**
 * Segmented control built on Mantine's `SegmentedControl`.
 *
 * Maps the design-system CSS module onto Mantine's slots (`root`, `control`,
 * `input`, `label`, `indicator`, `innerLabel`) so the control picks up theme
 * tokens, and appends the caller's `className` to the root element.
 *
 * @param props           - {@link SegmentedControlProps} for the control.
 * @param props.className - Extra classes appended to the root element.
 * @returns A Mantine `SegmentedControl` with design-system classes.
 */
export const SegmentedControl: React.FC<SegmentedControlProps> = ({ className = "", ...props }) => {
	return <MantineSegmentedControl className={className} classNames={{ root: styles.segmentedControl, control: styles.control, input: styles.input, label: styles.label, indicator: styles.indicator, innerLabel: styles.innerLabel }} {...props} />;
};
