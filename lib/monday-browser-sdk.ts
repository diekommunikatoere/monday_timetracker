// lib/monday-browser-sdk.ts
import mondaySdk, { MondayClientSdk } from "monday-sdk-js";

let instance: MondayClientSdk | null = null;

/**
 * Lazily-constructed, memoized monday.com embed SDK instance (browser-only
 * features: `get("context"/"sessionToken")`, `listen("context")`).
 *
 * `monday-sdk-js` picks its implementation at construction time based on
 * `typeof window` — calling `mondaySdk()` at module top-level means Next.js
 * SSR/RSC evaluation constructs the **deprecated server SDK** and prints its
 * warning, even though nothing here ever calls a server method. Deferring
 * construction to first call (which only ever happens client-side, inside
 * effects/handlers) ensures only the client SDK is ever built.
 */
export function getMondaySdk(): MondayClientSdk {
	if (!instance) {
		// `mondaySdk()` is overloaded (client vs. server config shape); with no
		// args TS resolves the last (server) overload, so assert the type we
		// know is correct here — this is only ever called client-side.
		instance = mondaySdk() as MondayClientSdk;
	}
	return instance;
}
