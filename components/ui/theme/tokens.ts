// components/ui/theme/tokens.ts
// Design-system theme tokens mapped to CSS custom properties via Mantine's resolver.

import { CSSVariablesResolver } from "@mantine/core";

/**
 * Mantine `CSSVariablesResolver` that exposes the entire design-system token
 * palette as CSS custom properties.
 *
 * Wired into the app in `app/layout.tsx` through `MantineProvider`'s
 * `cssVariablesResolver`. The returned object has three sections, mirroring
 * Mantine's resolver contract:
 *
 * - **`variables`** — theme-independent tokens emitted on `:root` for both
 *   schemes. Includes the full color ramps (`--color--primary-*`,
 *   `--color--secondary-*`, `--color--tertiary-*`, `--color--success-*`,
 *   `--color--error-*`, each 50→950), the font stacks (`--font--primary`,
 *   `--font--headlines`, `--font--body`, `--font--mono`), the type scale
 *   (`--font--size-*` paired with `--font--line-height-*` from `xs` to
 *   `xxxl`), font weights (`--font--weight-*`), radii
 *   (`--border-radius--*`), shadows (`--box-shadow--*`) and the global
 *   `--transition`.
 *
 * - **`light`** — overrides applied under the light color scheme. Resolves
 *   semantic tokens (selection, highlight, surface, background, button,
 *   border, text, icon families) to ramp steps appropriate for a light
 *   surface; e.g. `--color--background-primary` is `#ffffff` and text uses
 *   the darker `--color--tertiary-*` steps.
 *
 * - **`dark`** — overrides applied under the dark color scheme. Mirrors the
 *   `light` keys but inverts the ramp direction (e.g.
 *   `--color--background-primary` is `#000000`, text uses the lighter
 *   `--color--tertiary-*` steps) so contrast is preserved.
 *
 * Components reference these via `var(--color--...)`, `var(--font--...)`,
 * `var(--border-radius--...)`, `var(--box-shadow--...)` and `var(--transition)`;
 * because the semantic tokens resolve to ramp steps per scheme, the same
 * component markup stays correct in both themes.
 *
 * @param theme - The active Mantine theme (unused; tokens are fully self-contained).
 * @returns The resolver result with `variables`, `light` and `dark` token maps.
 */
export const themeTokens: CSSVariablesResolver = (theme) => ({
	variables: {
		/* PRIMARY */
		"--color--primary-50": "#16000c",
		"--color--primary-100": "#37001f",
		"--color--primary-200": "#630037",
		"--color--primary-300": "#8e004f",
		"--color--primary-400": "#af0062",
		"--color--primary-500": "#db007a",
		"--color--primary-600": "#e4409b",
		"--color--primary-700": "#e966af",
		"--color--primary-800": "#f199ca",
		"--color--primary-900": "#f6bfde",
		"--color--primary-950": "#fbe6f2",

		/* SECONDARY */
		"--color--secondary-50": "#1a1306",
		"--color--secondary-100": "#40300f",
		"--color--secondary-200": "#73551b",
		"--color--secondary-300": "#a67c28",
		"--color--secondary-400": "#cc9831",
		"--color--secondary-500": "#ffbe3d",
		"--color--secondary-600": "#ffce6e",
		"--color--secondary-700": "#ffd88b",
		"--color--secondary-800": "#ffe5b1",
		"--color--secondary-900": "#ffefcf",
		"--color--secondary-950": "#fff9ec",

		/* TERTIARY */
		"--color--tertiary-50": "#0f0e0c",
		"--color--tertiary-100": "#25241f",
		"--color--tertiary-200": "#424137",
		"--color--tertiary-300": "#5f5e50",
		"--color--tertiary-400": "#757362",
		"--color--tertiary-500": "#92907b",
		"--color--tertiary-600": "#adac9c",
		"--color--tertiary-700": "#bebcb0",
		"--color--tertiary-800": "#d3d3ca",
		"--color--tertiary-900": "#e4e3de",
		"--color--tertiary-950": "#f4f4f2",

		/* SUCCESS */
		"--color--success-50": "#031109",
		"--color--success-100": "#062b18",
		"--color--success-200": "#0b4c2a",
		"--color--success-300": "#106f3d",
		"--color--success-400": "#14884b",
		"--color--success-500": "#19aa5e",
		"--color--success-600": "#53bf86",
		"--color--success-700": "#75cc9e",
		"--color--success-800": "#a3ddbf",
		"--color--success-900": "#c6ead7",
		"--color--success-950": "#e8f7ef",

		/* ERROR */
		"--color--error-50": "#160003",
		"--color--error-100": "#370009",
		"--color--error-200": "#630011",
		"--color--error-300": "#8e0018",
		"--color--error-400": "#af002c",
		"--color--error-500": "#db0049",
		"--color--error-600": "#e44064",
		"--color--error-700": "#ea6c81",
		"--color--error-800": "#f199a8",
		"--color--error-900": "#f6bfc9",
		"--color--error-950": "#fbe6ea",

		"--font--primary": '"Gibson", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", sans-serif',
		"--font--headlines": '"Gibson", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", sans-serif',
		"--font--body": '"Gill Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", sans-serif',
		"--font--mono": '"Geist Mono", monospace',

		"--font--size-xs": "12px",
		"--font--line-height-xs": "18px",
		"--font--size-sm": "14px",
		"--font--line-height-sm": "21px",
		"--font--size-md": "16px",
		"--font--line-height-md": "24px",
		"--font--size-lg": "18px",
		"--font--line-height-lg": "27px",
		"--font--size-xl": "20px",
		"--font--line-height-xl": "30px",
		"--font--size-xxl": "24px",
		"--font--line-height-xxl": "36px",
		"--font--size-xxxl": "32px",
		"--font--line-height-xxxl": "48px",

		"--font--weight-regular": "400",
		"--font--weight-medium": "500",
		"--font--weight-bold": "700",

		"--border-radius--sm": "4px",
		"--border-radius--md": "8px",
		"--border-radius--lg": "12px",
		"--border-radius--xl": "16px",

		"--box-shadow--xs": "0 4px 6px -4px rgba(0, 0, 0, 0.1)",
		"--box-shadow--sm": "0 4px 8px rgba(0, 0, 0, 0.2)",
		"--box-shadow--md": "0 6px 20px rgba(0, 0, 0, 0.2)",
		"--box-shadow--lg": "0 15px 50px rgba(0, 0, 0, 0.4)",
		"--box-shadow--primary": "0 4px 12px rgba(219, 0, 122, 0.3)",
		"--box-shadow--secondary": "0 4px 12px rgba(255, 214, 64, 0.3)",
		"--box-shadow--error": "0 4px 12px rgba(243, 27, 99, 0.3)",
		"--box-shadow--success": "0 4px 12px rgba(74, 222, 128, 0.3)",

		"--transition": "all 0.1s ease-in-out",
	},
	light: {
		"--color--selected-primary": "var(--color--secondary-700)",
		"--color--selected-primary-hover": "var(--color--secondary-500)",
		"--color--selected-secondary": "var(--color--primary-900)",
		"--color--selected-secondary-hover": "var(--color--primary-500)",

		"--color--highlight": "var(--color--tertiary-900)",
		"--color--highlight-hover": "var(--color--tertiary-800)",
		"--color--highlight-primary": "var(--color--primary-950)",
		"--color--highlight-primary-hover": "var(--color--primary-700)",
		"--color--highlight-secondary": "var(--color--secondary-900)",
		"--color--highlight-secondary-hover": "var(--color--secondary-700)",

		"--color--surface-primary": "var(--color--primary-900)",
		"--color--surface-secondary": "var(--color--secondary-950)",

		"--color--background-primary": "#ffffff",
		"--color--background-primary-hover": "var(--color--tertiary-950)",
		"--color--background-secondary": "var(--color--tertiary-950)",
		"--color--background-secondary-hover": "var(--color--tertiary-900)",
		"--color--background-disabled": "var(--color--tertiary-700)",
		"--color--background-backdrop": "color-mix(in srgb, var(--color--tertiary-900) 70%, transparent)",

		"--color--button-primary-bg": "var(--color--primary-500)",
		"--color--button-primary-bg-hover": "var(--color--primary-400)",
		"--color--button-secondary-bg": "var(--color--secondary-500)",
		"--color--button-secondary-bg-hover": "var(--color--secondary-400)",
		"--color--button-tertiary-bg": "var(--color--tertiary-700)",
		"--color--button-tertiary-bg-hover": "var(--color--tertiary-600)",
		"--color--button-primary-muted-bg": "var(--color--tertiary-900)",
		"--color--button-primary-muted-bg-hover": "var(--color--tertiary-800)",

		"--color--border-ui": "var(--color--tertiary-500)",
		"--color--border-layout": "var(--color--tertiary-800)",
		"--color--border-active": "var(--color--tertiary-700)",
		"--color--border-disabled": "var(--color--tertiary-700)",

		"--color--text-primary": "var(--color--tertiary-100)",
		"--color--text-secondary": "var(--color--tertiary-300)",
		"--color--text-on-inverted": "var(--color--tertiary-900)",
		"--color--text-on-primary": "var(--color--primary-950)",
		"--color--text-on-secondary": "var(--color--secondary-950)",
		"--color--text-on-tertiary": "var(--color--tertiary-50)",
		"--color--text-disabled": "var(--color--tertiary-400)",
		"--color--text-on-primary-muted": "var(--color--primary-400)",
		"--color--text-placeholder": "var(--color--tertiary-500)",
		"--color--text-link": "var(--color--primary-300)",

		"--color--icon": "var(--color--tertiary-300)",
		"--color--icon-on-primary": "var(--color--primary-950)",
		"--color--icon-on-secondary": "var(--color--tertiary-100)",
		"--color--icon-on-tertiary": "var(--color--tertiary-50)",
	},
	dark: {
		"--color--selected-primary": "var(--color--secondary-100)",
		"--color--selected-primary-hover": "var(--color--secondary-200)",
		"--color--selected-secondary": "var(--color--primary-100)",
		"--color--selected-secondary-hover": "var(--color--primary-200)",

		"--color--highlight": "var(--color--tertiary-100)",
		"--color--highlight-hover": "var(--color--tertiary-200)",
		"--color--highlight-primary": "var(--color--primary-100)",
		"--color--highlight-primary-hover": "var(--color--primary-200)",
		"--color--highlight-secondary": "var(--color--secondary-100)",
		"--color--highlight-secondary-hover": "var(--color--secondary-200)",

		"--color--surface-primary": "var(--color--primary-100)",
		"--color--surface-secondary": "var(--color--secondary-50)",

		"--color--background-primary": "#000000",
		"--color--background-primary-hover": "var(--color--tertiary-100)",
		"--color--background-secondary": "var(--color--tertiary-100)",
		"--color--background-secondary-hover": "var(--color--tertiary-200)",
		"--color--background-disabled": "var(--color--tertiary-300)",
		"--color--background-backdrop": "color-mix(in srgb, var(--color--tertiary-100) 70%, transparent)",

		"--color--button-primary-bg": "var(--color--primary-500)",
		"--color--button-primary-bg-hover": "var(--color--primary-600)",
		"--color--button-secondary-bg": "var(--color--secondary-500)",
		"--color--button-secondary-bg-hover": "var(--color--secondary-600)",
		"--color--button-tertiary-bg": "var(--color--tertiary-300)",
		"--color--button-tertiary-bg-hover": "var(--color--tertiary-400)",
		"--color--button-primary-muted-bg": "var(--color--tertiary-100)",
		"--color--button-primary-muted-bg-hover": "var(--color--tertiary-200)",

		"--color--border-ui": "var(--color--tertiary-500)",
		"--color--border-layout": "var(--color--tertiary-400)",
		"--color--border-active": "var(--color--tertiary-300)",
		"--color--border-disabled": "var(--color--tertiary-300)",

		"--color--text-primary": "var(--color--tertiary-900)",
		"--color--text-secondary": "var(--color--tertiary-700)",
		"--color--text-on-inverted": "var(--color--tertiary-100)",
		"--color--text-on-primary": "var(--color--primary-900)",
		"--color--text-on-secondary": "var(--color--secondary-900)",
		"--color--text-on-tertiary": "var(--color--tertiary-900)",
		"--color--text-disabled": "var(--color--tertiary-500)",
		"--color--text-on-primary-muted": "var(--color--primary-600)",
		"--color--text-placeholder": "var(--color--tertiary-600)",
		"--color--text-link": "var(--color--primary-700)",

		"--color--icon": "var(--color--tertiary-800)",
		"--color--icon-on-primary": "var(--color--tertiary-950)",
		"--color--icon-on-secondary": "var(--color--tertiary-100)",
		"--color--icon-on-tertiary": "var(--color--tertiary-950)",
	},
});
