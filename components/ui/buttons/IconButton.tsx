"use client";

import { ActionIcon } from "@mantine/core";
import styles from "@/components/styles/ui/buttons/IconGroup.module.css";

import { IconButtonProps } from "./types";

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
		<ActionIcon classNames={{ root: (styles.iconButton, styles[buttonVariant]) }} onClick={onClick} {...props}>
			{children}
		</ActionIcon>
	);
}

export default IconButton;
