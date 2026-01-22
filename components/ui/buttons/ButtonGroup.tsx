"use client";

import { ButtonGroupProps } from "@/components/ui/buttons/types";
import { Button } from "@mantine/core";

import "@/components/styles/ui/buttons/ButtonGroup.module.css";

export function ButtonGroup({ children, className }: ButtonGroupProps) {
	if (!className) {
		className = "";
	}

	return <Button.Group className={`button-group${className}`}>{children}</Button.Group>;
}
