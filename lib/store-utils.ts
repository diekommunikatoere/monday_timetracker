// lib/store-utils.ts — SSR hydration utilities for Zustand persisted stores.

import { useEffect, useState } from "react";

/**
 * Returns `true` once the component has mounted on the client, `false` during SSR
 * and the initial render.
 *
 * Zustand persisted stores use `skipHydration: true` so they don't automatically
 * rehydrate from `localStorage` on the server (which would cause a hydration mismatch).
 * `StoreProvider` in the root layout calls `rehydrate()` on the client; this hook is
 * the gate that prevents any component from reading persisted state before that happens.
 *
 * @returns `true` after first client-side effect runs; `false` on server and first render.
 */
export function useHydration() {
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		setHydrated(true);
	}, []);

	return hydrated;
}

/**
 * Returns `fallback` during SSR and the first render, then switches to `value` once the
 * client has hydrated. Use this to render a safe placeholder while persisted Zustand state
 * is unavailable, then swap in the real value without a mismatch.
 *
 * @typeParam T    - The type of both values.
 * @param value    - The real (persisted) value to use after hydration.
 * @param fallback - The SSR-safe placeholder to use before hydration.
 * @returns `fallback` on the server and first render; `value` thereafter.
 */
export function useSSRSafeValue<T>(value: T, fallback: T): T {
	const hydrated = useHydration();
	return hydrated ? value : fallback;
}
