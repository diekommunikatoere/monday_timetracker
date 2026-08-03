// components/ui/buttons/IconButton.tsx
// Square icon-only action button mapping colorVariant to CSS module classes.

"use client";

import { ActionIcon } from "@mantine/core";

import { IconButtonProps } from "./types";

import styles from "@/components/styles/ui/buttons/IconGroup.module.css";

/**
 * Icon-only action button built on Mantine's `ActionIcon`.
 *
 * Translates the semantic `colorVariant` prop into a concrete CSS-module class
 * from `IconGroup.module.css`. **The mapping is intentional and explicit** —
 * `colorVariant` is the design-system enum, while the resolved `buttonVariant`
 * is the internal class key:
 *   - `primary`        → `buttonPrimary`
 *   - `secondary`      → `buttonSecondary`
 *   - `tertiary`       → `buttonTertiary`
 *   - `primary-muted`  → `buttonPrimaryMuted`
 *   - `default` (or any unmatched value) → `default`
 *
 * Both the base `iconButton` class and the resolved variant class are applied
 * via the `root` `classNames` slot. `onClick` and all remaining
 * {@link IconButtonProps} are spread onto `ActionIcon`, so `href`, `size`,
 * `aria-label`, etc. pass through unchanged.
 *
 * @param props                - {@link IconButtonProps} for the button.
 * @param props.colorVariant   - Semantic color variant; defaults to `default`.
 * @param props.onClick        - Click handler forwarded to `ActionIcon`.
 * @param props.href           - Optional link target; when set the underlying element is rendered as an anchor.
 * @returns An `ActionIcon` element styled with the design-system icon-button classes.
 */
export function IconButton({ children, colorVariant, onClick, href, ...props }: IconButtonProps) {
	let buttonVariant: "buttonPrimary" | "buttonSecondary" | "buttonTertiary" | "buttonPrimaryMuted" | "default";

	switch (colorVariant) {
		case "primary":
			buttonVariant = "buttonPrimary";
			break;
		case "secondary":
			buttonVariant = "buttonSecondary";
			break;
		case "tertiary":
			buttonVariant = "buttonTertiary";
			break;
		case "primary-muted":
			buttonVariant = "buttonPrimaryMuted";
			break;
		default:
			buttonVariant = "default";
	}

	return (
		<ActionIcon classNames={{ root: `${styles.iconButton} ${styles[buttonVariant]}${props.className ? ` ${props.className}` : ""}` }} onClick={onClick} {...props}>
			{children}
		</ActionIcon>
	);
}

export default IconButton;
