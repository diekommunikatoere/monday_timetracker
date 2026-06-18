// components/features/timer/TimerProvider.tsx
import { ReactNode } from "react";
import TimerContext from "@/contexts/TimerContext";
import { useTimer } from "@/components/features/timer/hooks/useTimer";

/**
 * `TimerProvider` — React context provider that exposes the {@link useTimer}
 * hook's return value to the timer feature subtree.
 *
 * It instantiates {@link useTimer} once (which sets up the Supabase realtime
 * subscription, session loading, and the 1-second elapsed-time tick) and pushes
 * the resulting `{ state, actions, hasSession, ... }` onto `TimerContext`.
 *
 * Descendant components (e.g. {@link TimerContainer}, `TimerDashboardHeader`)
 * consume it via the {@link useTimerContext} hook rather than calling
 * {@link useTimer} themselves — this guarantees a single shared timer instance
 * per mounted dashboard widget.
 *
 * @param props.children - The subtree that needs access to timer state/actions.
 * @returns A `TimerContext.Provider` wrapping `children`.
 */
export function TimerProvider({ children }: { children: ReactNode }) {
	const timer = useTimer();

	return <TimerContext.Provider value={timer}>{children}</TimerContext.Provider>;
}
