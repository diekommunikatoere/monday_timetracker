"use client";

import { IconProps } from "./types";
import * as icons from "@/components/ui/icons";

import "@/components/styles/ui/icons/Icon.module.css";

export function Icon({ name, size = 24, color = "#282616", weight = "default", className }: IconProps) {
	const IconComponent = icons[name as keyof typeof icons] as React.ComponentType<{ size?: number; color?: string; weight?: "default" | "bold"; className?: string }>;
	if (!IconComponent) {
		console.warn(`Icon "${name}" not found`);
		return null;
	}
	return <IconComponent size={size} color={color} weight={weight} className={className} />;
}
