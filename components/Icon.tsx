import { IconProps } from "@/types/IconProps";
import * as icons from "./icons";

export function Icon({ name, size = 24, color = "#282616", className }: IconProps) {
	const IconComponent = icons[name as keyof typeof icons] as React.ComponentType<{ size?: number; color?: string }>;
	if (!IconComponent) {
		console.warn(`Icon "${name}" not found`);
		return null;
	}
	return <IconComponent size={size} color={color} />;
}
