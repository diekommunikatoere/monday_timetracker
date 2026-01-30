"use client";

import { Button as MantineButton } from "@mantine/core";
import { ButtonProps } from "./types";
import "@/components/styles/ui/buttons/Button.module.css";

export function Button({ iconLeft, iconRight, children, onClick, loading, disabled, ...props }: ButtonProps) {
	let className = props.className || "";

	if (props.variant) {
		className = className + ` button--${props.variant}`;
	} else {
		className = className + ` button--primary`;
	}

	return (
		<MantineButton className={`button ${className}`} loading={loading} disabled={disabled} leftSection={iconLeft} rightSection={iconRight} onClick={onClick} {...props}>
			{children}
		</MantineButton>
	);
}
