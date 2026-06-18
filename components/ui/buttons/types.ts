// components/ui/buttons/types.ts
// Shared prop types for the button design-system components.

import React from "react";
import { ButtonProps as MantineButtonProps, ButtonGroupProps as MantineButtonGroupProps, ActionIconProps as MantineActionIconProps } from "@mantine/core";

/**
 * Props for the {@link Button} component.
 *
 * Extends Mantine's `ButtonProps` with design-system affordances for icon
 * slots. Note that `onClick` here is typed as a no-argument handler (not
 * Mantine's `MouseEvent`-carrying signature) — callers should not rely on
 * receiving the event object.
 *
 * @property iconLeft  - Optional node rendered before the label (Mantine `leftSection`).
 * @property iconRight - Optional node rendered after the label (Mantine `rightSection`).
 * @property children  - Button label/content; **required**.
 * @property onClick   - Zero-argument click handler.
 * @property loading   - When true, shows Mantine's loading spinner.
 * @property disabled  - When true, disables the button.
 */
export type ButtonProps = MantineButtonProps & {
	iconLeft?: React.ReactNode;
	iconRight?: React.ReactNode;
	children: React.ReactNode;
	onClick?: () => void;
	loading?: boolean;
	disabled?: boolean;
};

/**
 * Props for the {@link ButtonGroup} component.
 *
 * Adds nothing beyond Mantine's `ButtonGroupProps` except a **required**
 * `children` so the group is never rendered empty.
 *
 * @property children - The {@link Button} elements to lay out as a group.
 */
export type ButtonGroupProps = MantineButtonGroupProps & {
	children: React.ReactNode;
};

/**
 * Props for the {@link IconButton} component.
 *
 * Extends Mantine's `ActionIconProps` with the design-system `colorVariant`
 * enum. Allowed `colorVariant` values and their meaning:
 *   - `"primary"`       — primary brand color.
 *   - `"secondary"`     — secondary brand color.
 *   - `"tertiary"`      — neutral/tertiary color.
 *   - `"primary-muted"` — muted primary surface (used e.g. by {@link ThemeToggle}).
 *   - `"default"`       — unstyled/default variant (also the fallback).
 *
 * @property children     - Icon content; **required**.
 * @property colorVariant - Semantic color variant; defaults to `default` when omitted.
 * @property onClick      - Zero-argument click handler.
 * @property href         - Optional URL; presence hints at anchor usage (see {@link IconLink} for a true link).
 */
export type IconButtonProps = MantineActionIconProps & {
	children: React.ReactNode;
	colorVariant?: "primary" | "secondary" | "tertiary" | "primary-muted" | "default";
	onClick?: () => void;
	href?: string;
};

/**
 * Props for the {@link IconLink} component.
 *
 * Like {@link IconButtonProps} but `href` is **required** because the element
 * is always rendered as an anchor (`component="a"`). `colorVariant` is not
 * supported here — links rely solely on the `icon-link` styles.
 *
 * @property children - Icon content; **required**.
 * @property href     - Destination URL; **required**.
 */
export type IconLinkProps = MantineActionIconProps & {
	children: React.ReactNode;
	href: string;
};
