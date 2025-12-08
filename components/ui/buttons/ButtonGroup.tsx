import "@/public/css/components/ui/buttons/ButtonGroup.module.css";
import { ButtonGroupProps } from "@/components/ui/buttons/types";
import { Button } from "@mantine/core";

export function ButtonGroup({ children, className }: ButtonGroupProps) {
	return <Button.Group className={`button-group ${className}`}>{children}</Button.Group>;
}
