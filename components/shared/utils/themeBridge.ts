// components/shared/utils/themeBridge.ts
"use client";

/**
 * Lightweight runtime bridge to read CSS variables (theme tokens)
 * - Reads values from :root CSS variables (e.g. --color--primary, --spacing-md)
 * - Caches results for performance, with helpers to invalidate/refresh
 *
 * Use when JS needs numeric values (breakpoints, spacing) or needs to read
 * theme colors for runtime logic (canvas tinting, third-party libs).
 */

/**
 * Lightweight runtime bridge that reads CSS variables (design-system theme
 * tokens) from `:root` and exposes them to JS.
 *
 * - Reads values from `:root` CSS variables (e.g. `--color--primary`,
 *   `--spacing-md`), **not** from the monday context. monday context theme data
 *   is consumed separately (see `.kilocode/rules`); this module is purely a
 *   `getComputedStyle` reader.
 * - Caches results in-process for performance, with helpers to invalidate /
 *   refresh a single token or the whole cache.
 *
 * Use when JS needs numeric values (breakpoints, spacing) or needs to read
 * theme colors for runtime logic (canvas tinting, third-party libs).
 *
 * @param varName - Fully-qualified CSS custom property, including the leading
 *                  `--` (e.g. `"--color--primary"`).
 * @returns The trimmed raw token string, or `null` when not running in a
 *          browser, when the document is unavailable, or when the variable is
 *          unset/empty.
 */
export function getCssVar(varName: string): string | null {
	if (typeof window === "undefined" || !window.document) return null;
	const val = getComputedStyle(document.documentElement).getPropertyValue(varName);
	if (!val) return null;
	return val.trim();
}

/** Simple in-memory cache to avoid repeated getComputedStyle calls */
const cache = new Map<string, string | null>();

/**
 * Cached variant of {@link getCssVar}. Same semantics, but consults the
 * module-level `cache` first and stores the result (including `null`s) so
 * repeated reads of the same token avoid `getComputedStyle`.
 *
 * @param varName - CSS custom property name (with leading `--`).
 * @returns The cached token string, or `null` if absent/empty. A stored `null`
 *          is a real "unset" result, not a cache miss.
 */
export function getToken(varName: string): string | null {
	if (cache.has(varName)) return cache.get(varName) ?? null;
	const v = getCssVar(varName);
	cache.set(varName, v);
	return v;
}

/**
 * Drops a single cached token, or clears the entire cache when called with no
 * argument. Call this after the theme tokens change (e.g. a theme switch) and
 * before the next read, or use {@link refreshCache} to clear all entries.
 *
 * @param varName - Optional single token to invalidate; omit to clear everything.
 */
export function invalidateToken(varName?: string) {
	if (varName) cache.delete(varName);
	else cache.clear();
}

/**
 * Parses a CSS value of the form `"NNpx"` or a plain numeric string into a
 * number. Anything that doesn't match an optional sign + digits (+ optional
 * decimals) + optional `px` suffix yields `null`.
 *
 * @param value - The raw token string (e.g. `"16px"`, `"1.5"`, `"-8px"`), or `null`.
 * @returns The parsed number, or `null` when `value` is empty or unparseable.
 */
export function parsePx(value: string | null): number | null {
	if (!value) return null;
	const cleaned = value.trim();
	const match = cleaned.match(/^(-?\d+(\.\d+)?)(px)?$/);
	if (!match) return null;
	return parseFloat(match[1]);
}

/**
 * Reads a token and returns it as a **number** (e.g. a spacing or breakpoint
 * value). Uses {@link getToken} + {@link parsePx}; falls back to the supplied
 * default when the token is missing or non-numeric.
 *
 * @param varName  - CSS custom property name (with leading `--`).
 * @param fallback - Value returned when the token can't be parsed. Defaults to `0`.
 * @returns The numeric token value, or `fallback`.
 */
export function getNumber(varName: string, fallback = 0): number {
	const v = getToken(varName);
	const n = parsePx(v);
	return typeof n === "number" && !isNaN(n) ? n : fallback;
}

/**
 * Reads a raw color / string token. Unlike {@link getNumber} this does not
 * parse — it returns the trimmed string as-is.
 *
 * @param varName  - CSS custom property name (with leading `--`).
 * @param fallback - Returned when the token is empty/absent. Defaults to `null`.
 * @returns The token string, or `fallback` when unset.
 */
export function getColor(varName: string, fallback: string | null = null): string | null {
	const v = getToken(varName);
	return v || fallback;
}

/**
 * Convenience helper for the `--spacing-*` token family.
 *
 * @param size     - One of the canonical spacing scale keys: `"xs" | "sm" | "md" | "lg" | "xl" | "xxl"`.
 * @param fallback - Returned when the token can't be parsed. Defaults to `0`.
 * @returns The numeric spacing value, or `fallback`.
 */
export function getSpacing(size: "xs" | "sm" | "md" | "lg" | "xl" | "xxl", fallback = 0) {
	return getNumber(`--spacing-${size}`, fallback);
}

/**
 * Convenience helper for the `--breakpoint-*` token family.
 *
 * @param name     - Breakpoint name suffix (e.g. `"md"`).
 * @param fallback - Returned when the token can't be parsed. Defaults to `0`.
 * @returns The numeric breakpoint value, or `fallback`.
 */
export function getBreakpoint(name: string, fallback = 0) {
	return getNumber(`--breakpoint-${name}`, fallback);
}

/**
 * Bulk-reads several tokens in one pass, returning a map keyed by the
 * **variable name** (with leading `--`). Each value goes through {@link getToken}.
 *
 * @param varNames - Array of CSS custom property names.
 * @returns Object mapping each requested name to its token string or `null`.
 */
export function getTokens(varNames: string[]): Record<string, string | null> {
	const out: Record<string, string | null> = {};
	varNames.forEach((n) => {
		out[n] = getToken(n);
	});
	return out;
}

/**
 * Clears the entire token cache. Use after a theme switch so subsequent reads
 * re-query `:root`. Equivalent to {@link invalidateToken} with no argument.
 */
export function refreshCache() {
	cache.clear();
}

/**
 * Default export: a namespace object bundling every public reader/helper for
 * `import themeBridge from "..."` usage.
 */
export default {
	getCssVar,
	getToken,
	getNumber,
	getColor,
	getSpacing,
	getBreakpoint,
	getTokens,
	invalidateToken,
	refreshCache,
};
