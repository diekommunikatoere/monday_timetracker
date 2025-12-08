import "@/public/css/components/ui/buttons/Button.module.css";
import { Button as MantineButton } from "@mantine/core";
import { ButtonProps } from "./types";

export function Button(props: ButtonProps) {
	let className = props.className || "";

	if (props.variant) {
		className = className + ` button--${props.variant}`;
	}

	return (
		<MantineButton className={className} loading={props.loading} disabled={props.disabled} leftSection={props.iconLeft} rightSection={props.iconRight} onClick={props.onClick} {...props}>
			{props.children}
		</MantineButton>
	);
}
