// types/IconProps.ts
// Shared prop contracts for the icon components in components/icons/.

/**
 * Props for the generic <Icon> dispatcher, which looks up a concrete icon by
 * `name` and renders it.
 *
 * @property name      - Icon identifier used to resolve the concrete component.
 * @property size      - Rendered width/height in pixels. Defaults are set per icon.
 * @property color     - CSS color (hex/var/keyword) applied as `fill`/`stroke`.
 * @property className - Extra class names forwarded to the root SVG element.
 */
export interface IconProps {
	name: string;
	size?: number;
	color?: string;
	className?: string;
}

/**
 * Props for an individual, already-resolved icon component (no `name`, since the
 * component identity already determines which glyph is drawn).
 *
 * @property size  - Rendered width/height in pixels.
 * @property color - CSS color applied as `fill`/`stroke`.
 */
export interface IconComponentProps {
	size?: number;
	color?: string;
}
