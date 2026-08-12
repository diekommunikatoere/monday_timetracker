// components/StoreProvider.tsx
// Client-side wrapper that rehydrates persisted Zustand stores after mount.

"use client";

import { useEffect, useRef } from "react";

import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";

/**
 * Rehydrates the app's persisted Zustand stores (`timerStore`, `userStore`,
 * `timeEntriesStore`) on first client mount. **This must run client-side
 * only** — the stores are persisted to `localStorage`, so calling
 * `persist.rehydrate()` during SSR would read browser storage and cause
 * hydration mismatches. A `useRef` guard ensures rehydration fires exactly
 * once per provider instance.
 *
 * @param children - React subtree to render once mounted.
 * @returns `children` unchanged (this provider renders no UI of its own).
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
	const hydrated = useRef(false);

	useEffect(() => {
		if (!hydrated.current) {
			// Manually hydrate persisted stores
			useTimerStore.persist.rehydrate();
			useUserStore.persist.rehydrate();
			useTimeEntriesStore.persist.rehydrate();
			hydrated.current = true;
		}
	}, []);

	return <>{children}</>;
}
