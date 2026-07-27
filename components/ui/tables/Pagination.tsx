// components/ui/tables/Pagination.tsx
// Page-number pagination control wrapper with design-system button styling.

"use client";

import { Pagination as MantinePagination } from "@mantine/core";
import React from "react";

import styles from "@/components/styles/ui/tables/Pagination.module.css";

import { PaginationProps } from "./types";

/**
 * Page-number pagination built on Mantine's `Pagination`.
 *
 * Applies the `pagination` root class plus `control`/`dots` classes so the
 * page buttons pick up design-system colors (active/hover/disabled) instead
 * of Mantine's defaults, matching `Button`/`IconButton` styling. Mantine
 * merges these onto its own structural classes rather than replacing them, so
 * layout (flex, gap) still comes from Mantine — this file only adds color.
 *
 * @param props           - {@link PaginationProps} for the control.
 * @param props.className - Extra classes appended after the base `pagination` class.
 * @returns A Mantine `Pagination` with design-system classes.
 */
export const Pagination: React.FC<PaginationProps> = ({ className = "", ...props }) => {
	const paginationClass = [styles.pagination, className].filter(Boolean).join(" ");

	return <MantinePagination classNames={{ root: paginationClass, control: styles.control, dots: styles.dots }} {...props} />;
};
