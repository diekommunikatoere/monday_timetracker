"use client";

import { useEffect, useRef } from "react";
import { useTimerStore } from "@/stores/timerStore";
import { useUserStore } from "@/stores/userStore";
import { useDraftStore } from "@/stores/draftStore";

/**
 * StoreProvider component to handle Zustand store hydration for Next.js SSR
 * This ensures persisted stores are properly hydrated after the client-side mount
 * preventing hydration mismatches
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
	const hydrated = useRef(false);

	useEffect(() => {
		if (!hydrated.current) {
			// Manually hydrate persisted stores
			useTimerStore.persist.rehydrate();
			useUserStore.persist.rehydrate();
			useDraftStore.persist.rehydrate();
			hydrated.current = true;
		}
	}, []);

	return <>{children}</>;
}
