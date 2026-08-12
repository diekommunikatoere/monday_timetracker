// components/ui/buttons/Button.tsx
// Primary button component wrapping Mantine's Button with design-system variants.

"use client";

import { Button as MantineButton } from "@mantine/core";

import { ButtonProps } from "./types";

import styles from "@/components/styles/ui/buttons/Button.module.css";

/**
 * Design-system button built on Mantine's `Button`.
 *
 * Appends a `button--<variant>` modifier class (defaulting to `button--primary`
 * when no `variant` is supplied) so the project's CSS module can theme the
 * control. `iconLeft`/`iconRight` are forwarded to Mantine's `leftSection`/
 * `rightSection` slots, and `loading`/`disabled` map straight through. All
 * remaining {@link ButtonProps} are spread onto the underlying element, so
 * callers can still pass any native/Mantine prop.
 *
 * @param props      - {@link ButtonProps} for the button.
 * @param props.iconLeft  - Optional node rendered in the left section (typically an icon).
 * @param props.iconRight - Optional node rendered in the right section (typically an icon).
 * @param props.variant   - Visual variant; falls back to `primary` when omitted.
 * @param props.loading   - When true, shows Mantine's loading indicator.
 * @param props.disabled  - When true, disables interaction.
 * @param props.className - Extra classes appended after the base/modifier classes.
 * @returns A Mantine `Button` element with design-system classes applied.
 */
export function Button({ iconLeft, iconRight, children, onClick, loading, disabled, variant, className = "", ...props }: ButtonProps) {
	const buttonClass = [styles.button, styles[`button--${variant || "primary"}`], className].filter(Boolean).join(" ");

	return (
		<MantineButton classNames={{ root: buttonClass }} variant={variant} loading={loading} disabled={disabled} leftSection={iconLeft} rightSection={iconRight} onClick={onClick} {...props}>
			{children}
		</MantineButton>
	);
}
