// components/ui/icons/Icon.tsx
// Dynamic icon resolver that looks up a named icon from the icon registry.

"use client";

import { IconProps } from "./types";
import "material-symbols";

import "@/components/styles/ui/icons/Icon.module.css";

/**
 * Renders a Google Material Symbols glyph via the font-ligature technique —
 * **not** a component registry lookup. `name` is written directly as the
 * `<span>`'s text content; the `material-symbols-rounded` webfont (loaded via
 * the side-effect `import "material-symbols"`) substitutes the matching glyph
 * through an OpenType ligature. Consequently **`name` must be a valid Material
 * Symbols icon name in `snake_case`** (e.g. `"add"`, `"chevron_left"`,
 * `"play_arrow"`), not a key from any local file — see the
 * [Material Symbols catalog](https://fonts.google.com/icons) for valid names.
 * There is no validation: an unrecognized `name` renders as literal text
 * rather than warning or returning `null`.
 *
 * `weight`, `filled`, and `opsz` don't touch `name` or markup — they're
 * encoded into the CSS `font-variation-settings` string (`wght`/`FILL`/`opsz`
 * variable-font axes), which is how this single glyph font renders bold,
 * filled, and differently-optically-sized variants without swapping assets.
 *
 * @param props         - {@link IconProps} for the icon
 * @param props.name    - Material Symbols icon name (`snake_case`); rendered verbatim as text.
 * @param props.size    - Pixel size, applied as the `<span>`'s `font-size`; defaults to `24`.
 * @param props.color   - CSS color; defaults to `"currentColor"`.
 * @param props.weight  - `"default"` (`wght` 400) or `"bold"` (`wght` 700); defaults to `"default"`.
 * @param props.filled  - When true, sets the `FILL` axis to `1` for the solid variant; defaults to `false`.
 * @param props.opsz    - Optical-size axis value, as a string; defaults to `24`.
 * @returns A `<span>` whose text content resolves to the glyph via font ligature.
 */

export function Icon({ name, size = 24, color = "currentColor", weight = "default", filled = false, className, opsz = 24 }: IconProps) {
	const classNames = `icon material-symbols-rounded ${className || ""}`;
	const fontVariationSettings = `"opsz" ${opsz}, "wght" ${weight === "bold" ? 700 : 400}, "FILL" ${filled ? 1 : 0}, "GRAD" 0`;
	return (
		<span style={{ fontVariationSettings, color: color, fontSize: size, lineHeight: 1 }} className={classNames}>
			{name}
		</span>
	);
}
