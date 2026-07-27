// components/ui/buttons/IconLink.tsx
// Icon-only link rendered as an anchor via Mantine's ActionIcon.

"use client";

import { ActionIcon } from "@mantine/core";

import styles from "@/components/styles/ui/buttons/IconLink.module.css";

import { IconLinkProps } from "./types";

/**
 * Icon-only hyperlink built on Mantine's `ActionIcon` with `component="a"`.
 *
 * Unlike {@link IconButton} (which is a button element), this renders a real
 * anchor so the browser handles navigation, middle-click and `href` semantics.
 * The `icon-link` class is always applied; all remaining {@link IconLinkProps}
 * (including `href`, which is **required** here) are spread onto the anchor.
 *
 * @param props      - {@link IconLinkProps} for the link.
 * @param props.href - Destination URL; required so the anchor is always navigable.
 * @returns An `ActionIcon` rendered as an `<a>` element with the `icon-link` class.
 */
export function IconLink({ children, href, ...props }: IconLinkProps) {
	return (
		<ActionIcon className={styles["icon-link"]} component="a" href={href} {...props}>
			{children}
		</ActionIcon>
	);
}

export default IconLink;
