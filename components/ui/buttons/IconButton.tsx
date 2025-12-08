import "@/public/css/components/ui/buttons/IconGroup.module.css";
import { ActionIcon } from "@mantine/core";

import { IconButtonProps } from "./types";

export function IconButton({ children, onClick, href, ...props }: IconButtonProps) {
	return (
		<ActionIcon onClick={onClick} {...props}>
			{children}
		</ActionIcon>
	);
}

export default IconButton;
