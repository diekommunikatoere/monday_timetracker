import { useEffect, useState } from "react";

/**
 * Hook to handle hydration for Zustand stores with persist middleware
 * Prevents hydration mismatches by ensuring persisted state is only used on client
 * 
 * @returns boolean indicating if the store has been hydrated
 */
export function useHydration() {
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		setHydrated(true);
	}, []);

	return hydrated;
}

/**
 * Returns a safe value during SSR and the actual value after hydration
 * Use this when you need to render something during SSR but use persisted state on client
 * 
 * @param value - The value to use after hydration
 * @param fallback - The value to use during SSR
 */
export function useSSRSafeValue<T>(value: T, fallback: T): T {
	const hydrated = useHydration();
	return hydrated ? value : fallback;
}
