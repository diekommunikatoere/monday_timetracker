# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What's here

Static assets served directly by Next.js: component stylesheets, self-hosted fonts, SVG logos and icons. Design tokens have moved out of this directory — see below.

## CSS tokens (not in `public/`)

All design tokens are defined in [components/ui/theme/tokens.ts](../components/ui/theme/tokens.ts) as a Mantine `CSSVariablesResolver`, injected via `MantineProvider` in `app/layout.tsx`. The only CSS file loaded from `public/` is `fonts.css`.

Token groups:

- Raw palette scales: `--color--primary-50` … `--color--primary-950`, same for `secondary`, `tertiary`, `success`, `error`
- Semantic (light/dark per-theme): `--color--background-*`, `--color--text-*`, `--color--border-*`, `--color--icon-*`, `--color--button-*`, `--color--surface-*`, `--color--highlight-*`, `--color--selected-*`
- Typography: `--font--primary`, `--font--body`, `--font--mono`; size and line-height are **separate** tokens: `--font--size-md` + `--font--line-height-md`
- Spacing/shape: `--border-radius--sm/md/lg/xl`, `--box-shadow--xs/sm/md/lg`
- `--transition`

### monday.com platform tokens (`--primary-text-color`, `--ui-border-color`, etc.)

Some `css/components/` files (notably `AdminPage.css`) still reference monday's own CSS variable names. These are injected at runtime by the monday SDK — they are not defined anywhere in this repo.

## Fonts

Three self-hosted typefaces:

| Family | Weights | Used as |
| --- | --- | --- |
| Gibson | 100–900 | `--font--primary`, `--font--headlines` (headings, UI labels) |
| Gill Sans | 300–900 (+ italics) | `--font--body` (body text) |
| Geist Mono | 500, 700 | `--font--mono` (timer display, code) |

Font files live in `fonts/`. To add a new weight: drop the file in the appropriate subfolder and add a matching `@font-face` block in `css/fonts.css`. Formats served: woff2, woff, ttf, eot, svg (legacy).

## Component CSS (`css/components/`)

Component-scoped stylesheets loaded globally. They use semantic tokens rather than raw values. New component CSS files go here and must be imported from the Next.js app (e.g., in `app/globals.scss` or the component itself).

`RunningTimerDisplay.css` uses CSS nesting (`&.active`, `&.paused`) — this requires a modern browser or a PostCSS nesting plugin.

## Logos

Four SVG logo variants in `img/logo/`: `_black`, `_white`, `_light`, `_brand`. Choose based on the background context, not the current theme name (e.g., `_white` on dark backgrounds, `_brand` on neutral backgrounds).
