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

/** Read a CSS variable value from :root */
export function getCssVar(varName: string): string | null {
	if (typeof window === "undefined" || !window.document) return null;
	const val = getComputedStyle(document.documentElement).getPropertyValue(varName);
	if (!val) return null;
	return val.trim();
}

/** Simple in-memory cache to avoid repeated getComputedStyle calls */
const cache = new Map<string, string | null>();

/** Get a token with caching (store raw string) */
export function getToken(varName: string): string | null {
	if (cache.has(varName)) return cache.get(varName) ?? null;
	const v = getCssVar(varName);
	cache.set(varName, v);
	return v;
}

/** Invalidate a single cached token or the entire cache */
export function invalidateToken(varName?: string) {
	if (varName) cache.delete(varName);
	else cache.clear();
}

/** Parse "NNpx" or plain numeric strings to number (returns null if not parseable) */
export function parsePx(value: string | null): number | null {
	if (!value) return null;
	const cleaned = value.trim();
	const match = cleaned.match(/^(-?\d+(\.\d+)?)(px)?$/);
	if (!match) return null;
	return parseFloat(match[1]);
}

/** Get numeric token (e.g. spacing, breakpoint). Falls back to provided value. */
export function getNumber(varName: string, fallback = 0): number {
	const v = getToken(varName);
	const n = parsePx(v);
	return typeof n === "number" && !isNaN(n) ? n : fallback;
}

/** Get color or raw CSS token string */
export function getColor(varName: string, fallback: string | null = null): string | null {
	const v = getToken(varName);
	return v || fallback;
}

/** Convenience helpers for common token patterns */
export function getSpacing(size: "xs" | "sm" | "md" | "lg" | "xl" | "xxl", fallback = 0) {
	return getNumber(`--spacing-${size}`, fallback);
}

/** Get breakpoint numeric value (expects CSS var like --breakpoint-md) */
export function getBreakpoint(name: string, fallback = 0) {
	return getNumber(`--breakpoint-${name}`, fallback);
}

/** Read multiple tokens at once */
export function getTokens(varNames: string[]): Record<string, string | null> {
	const out: Record<string, string | null> = {};
	varNames.forEach((n) => {
		out[n] = getToken(n);
	});
	return out;
}

/** Refresh/clear cache (useful after a theme switch) */
export function refreshCache() {
	cache.clear();
}

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
