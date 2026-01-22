// contexts/TimerContext.tsx
import { createContext, useContext } from "react";
import type { UseTimerReturn } from "@/types/timer.types";

const TimerContext = createContext<UseTimerReturn | null>(null);

/**
 * Custom hook to access the timer state.
 *
 * @throws {Error} If used outside of a TimerProvider.
 * @returns {UseTimerReturn} The current timer state and actions.
 */
export function useTimerContext(): UseTimerReturn {
	const context = useContext(TimerContext);

	if (!context) {
		throw new Error("useTimerContext must be used within a TimerProvider");
	}

	return context;
}

export default TimerContext;
