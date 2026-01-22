// components/features/timer/TimerProvider.tsx
import { ReactNode } from "react";
import TimerContext from "@/contexts/TimerContext";
import { useTimer } from "@/components/features/timer/hooks/useTimer";

export function TimerProvider({ children }: { children: ReactNode }) {
	const timer = useTimer();

	return <TimerContext.Provider value={timer}>{children}</TimerContext.Provider>;
}
