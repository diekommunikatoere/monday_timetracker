// components/Icon.tsx
// Generic icon dispatcher that resolves a named glyph from `./ui/icons` and renders it.

import { IconProps } from "@/types/IconProps";
import * as icons from "./ui/icons";

/**
 * Renders an icon by looking up `name` in the {@link ./ui/icons} barrel and
 * forwarding `size`/`color` to the resolved component. **`name` must match an
 * exported icon key**; unknown names log a warning and render nothing, so
 * callers can safely omit null-guards.
 *
 * @param name      - Icon identifier matching a key of `./ui/icons`.
 * @param size      - Rendered width/height in pixels (default `24`).
 * @param color     - CSS color applied as `fill`/`stroke` (default `#282616`).
 * @param className - Optional extra class names (forwarded via {@link IconProps}).
 * @returns The resolved `<IconComponent>`, or `null` when `name` is unknown.
 */
export function Icon({ name, size = 24, color = "#282616", className }: IconProps) {
	const IconComponent = icons[name as keyof typeof icons] as React.ComponentType<{ size?: number; color?: string }>;
	if (!IconComponent) {
		console.warn(`Icon "${name}" not found`);
		return null;
	}
	return <IconComponent size={size} color={color} />;
}
