// components/ui/forms/Input.tsx
// Text input and textarea wrappers with design-system validation styling.

"use client";

import { SegmentedControl as MantineSegmentedControl, SegmentedControlProps } from "@mantine/core";
import React from "react";

import styles from "@/components/styles/ui/inputs/SegmentedControl.module.css";

/**
 * Mantine `SegmentedControl` with design-system classes applied.
 *
 * @param props - {@link SegmentedControlProps}, passed through to Mantine.
 * @returns A styled Mantine `SegmentedControl`.
 */
export const SegmentedControl: React.FC<SegmentedControlProps> = ({ className = "", ...props }) => {
	return <MantineSegmentedControl classNames={{ root: styles.segmentedControl, control: styles.control, input: styles.input, label: styles.label, indicator: styles.indicator, innerLabel: styles.innerLabel }} {...props} />;
};
