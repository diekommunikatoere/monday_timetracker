"use client";

import { Button as MantineButton } from "@mantine/core";
import { ButtonProps } from "./types";
import "@/public/css/components/ui/buttons/Button.module.css";

export function Button(props: ButtonProps) {
	let className = props.className || "";

	if (props.variant) {
		className = className + ` button--${props.variant}`;
	} else {
		className = className + ` button--primary`;
	}

	return (
		<MantineButton className={`button ${className}`} loading={props.loading} disabled={props.disabled} leftSection={props.iconLeft} rightSection={props.iconRight} onClick={props.onClick} {...props}>
			{props.children}
		</MantineButton>
	);
}
