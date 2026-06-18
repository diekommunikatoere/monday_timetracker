// components/ui/icons/types.ts
// Shared prop types for the icon set consumed by the {@link Icon} dispatcher and the
// individual glyph components under `components/icons/`.

/** Props accepted by the {@link Icon} dispatcher in `components/Icon.tsx`. */
// components/ui/icons/types.ts
// Shared prop types for the icon design-system components.

/**
 * Props accepted by the dynamic {@link Icon} resolver component.
 *
 * `name` is a loose string rather than a strict union so unknown names can be
 * reported gracefully (the component `console.warn`s and returns `null`).
 * Allowed values correspond to the keys re-exported from
 * `components/ui/icons/index.ts` (e.g. `"add"`, `"calendar"`, `"play"`).
 *
 * @property name     - Registry key of the icon to render; **required**.
 * @property size     - Pixel size of the icon (width/height); defaults to `24`.
 * @property color    - Icon color; any CSS color string; defaults to `"#282616"`.
 * @property weight   - Stroke weight; `"default"` or `"bold"`; defaults to `"default"`.
 * @property filled   - When true, renders the filled variant where the icon supports one.
 * @property className - Extra class names forwarded to the underlying SVG.
 */
export interface IconProps {
	name: string;
	size?: number;
	color?: string;
	weight?: "default" | "bold";
	filled?: boolean;
	className?: string;
}

/**
 * Props every concrete icon component (re-exported from
 * `components/ui/icons/index.ts`) is expected to accept.
 *
 * This is the contract the dynamic {@link Icon} component relies on when it
 * renders a looked-up component.
 *
 * @property size     - Pixel size of the icon (width/height).
 * @property color    - Icon color; any CSS color string.
 * @property weight   - Stroke weight; `"default"` or `"bold"`.
 * @property filled   - When true, renders the filled variant where supported.
 * @property className - Extra class names forwarded to the underlying SVG.
 */
export interface IconComponentProps {
	size?: number;
	color?: string;
	weight?: "default" | "bold";
	filled?: boolean;
	className?: string;
}

/**
 * Props accepted by every individual glyph component in `components/icons/`.
 *
 * - `size`      - Rendered width/height in pixels (default `24`).
 * - `color`     - CSS color applied as `fill` (default `#282616`).
 * - `weight`    - `"default"` (regular) or `"bold"` stroke variant.
 * - `filled`    - Solid track variant; honored by toggle icons.
 * - `className` - Optional extra class names forwarded to the `<svg>`.
 */
export interface IconComponentProps {
	size?: number;
	color?: string;
	weight?: "default" | "bold";
	filled?: boolean;
	className?: string;
}
