import "@/public/css/components/ui/buttons/IconGroup.module.css";
import { ActionIcon } from "@mantine/core";

import { IconLinkProps } from "./types";

export function IconLink({ children, href, ...props }: IconLinkProps) {
	return (
		<ActionIcon component="a" href={href} {...props}>
			{children}
		</ActionIcon>
	);
}

export default IconLink;
