// contexts/TimerContext.tsx
import { createContext, useContext } from "react";
import type { UseTimerReturn } from "@/types/timer.types";

/**
 * React context that carries the active {@link UseTimerReturn} instance produced
 * by the timer store/hook. Consumers must be descendants of the component that
 * mounts `TimerContext.Provider` — prefer the {@link useTimerContext} hook over
 * reading this context directly.
 */
const TimerContext = createContext<UseTimerReturn | null>(null);

/**
 * Returns the {@link UseTimerReturn} value from the nearest `TimerContext.Provider`.
 *
 * Wraps `useContext(TimerContext)` with a non-null assertion so callers can
 * destructure the result directly without an extra null check. Throws eagerly if
 * the context is absent so a missing-provider bug surfaces at the call site rather
 * than silently returning stale or empty state.
 *
 * @throws {Error} If called outside a `TimerContext.Provider`.
 * @returns The current timer state and action callbacks.
 */
export function useTimerContext(): UseTimerReturn {
	const context = useContext(TimerContext);

	if (!context) {
		throw new Error("useTimerContext must be used within a TimerProvider");
	}

	return context;
}

export default TimerContext;
