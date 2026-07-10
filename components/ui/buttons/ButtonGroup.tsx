// components/ui/buttons/ButtonGroup.tsx
// Layout wrapper that groups related buttons, backed by Mantine's Button.Group.

"use client";

import { ButtonGroupProps } from "@/components/ui/buttons/types";
import { Button } from "@mantine/core";

import styles from "@/components/styles/ui/buttons/ButtonGroup.module.css";

/**
 * Groups a set of {@link Button} children into a connected toolbar.
 *
 * Thin wrapper over Mantine's `Button.Group` that ensures the `button-group`
 * CSS class (plus any caller-supplied `className`) is always present. Any extra
 * {@link ButtonGroupProps} — e.g. Mantine's `orientation` or `buttonBorderRadius`
 * — are forwarded to `Button.Group`.
 *
 * @param props - {@link ButtonGroupProps} for the group.
 * @returns A Mantine `Button.Group` element with the design-system class applied.
 */
export function ButtonGroup({ children, className = "", ...props }: ButtonGroupProps) {
	const buttonGroupClass = [styles["button-group"], className].filter(Boolean).join(" ");

	return (
		<Button.Group className={buttonGroupClass} {...props}>
			{children}
		</Button.Group>
	);
}
