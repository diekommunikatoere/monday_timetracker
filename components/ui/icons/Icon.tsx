// components/ui/icons/Icon.tsx
// Dynamic icon resolver that looks up a named icon from the icon registry.

"use client";

import { IconProps } from "./types";
import * as icons from "@/components/ui/icons";

import "@/components/styles/ui/icons/Icon.module.css";

/**
 * Dynamically renders an icon from the icon registry by name.
 *
 * Looks up `name` in the {@link icons} barrel and renders the resolved
 * component, forwarding `size`, `color`, `weight`, `filled` and `className`.
 * Because the registry is imported as a namespace, **`name` must match a key
 * exported from `components/ui/icons/index.ts`** (e.g. `"add"`, `"calendar"`).
 * If the name is unknown the component logs a warning via `console.warn` and
 * returns `null` rather than throwing — callers should guard for that.
 *
 * @param props         - {@link IconProps} for the icon.
 * @param props.name    - Registry key of the icon to render; **required**.
 * @param props.size    - Pixel size; defaults to `24`.
 * @param props.color   - CSS color; defaults to `"#282616"`.
 * @param props.weight  - `"default"` or `"bold"`; defaults to `"default"`.
 * @param props.filled  - When true, requests the filled variant; defaults to `false`.
 * @returns The resolved icon element, or `null` when `name` is not registered.
 */
export function Icon({ name, size = 24, color = "#282616", weight = "default", filled = false, className }: IconProps) {
	const IconComponent = icons[name as keyof typeof icons] as React.ComponentType<{ size?: number; color?: string; weight?: "default" | "bold"; filled?: boolean; className?: string }>;
	if (!IconComponent) {
		console.warn(`Icon "${name}" not found`);
		return null;
	}
	return <IconComponent size={size} color={color} weight={weight} filled={filled} className={className} />;
}
