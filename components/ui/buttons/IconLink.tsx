"use client";

import { ActionIcon } from "@mantine/core";
import "@/components/styles/ui/buttons/IconLink.module.css";

import { IconLinkProps } from "./types";

export function IconLink({ children, href, ...props }: IconLinkProps) {
	return (
		<ActionIcon className={`icon-link`} component="a" href={href} {...props}>
			{children}
		</ActionIcon>
	);
}

export default IconLink;
