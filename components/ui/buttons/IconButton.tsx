"use client";

import { ActionIcon } from "@mantine/core";
import "@/components/styles/ui/buttons/IconGroup.module.css";

import { IconButtonProps } from "./types";

export function IconButton({ children, onClick, href, ...props }: IconButtonProps) {
	return (
		<ActionIcon className={`icon-button`} onClick={onClick} {...props}>
			{children}
		</ActionIcon>
	);
}

export default IconButton;
