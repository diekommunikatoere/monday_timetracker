// components/RunningTimerDisplay.tsx
/**
 * @deprecated This component is deprecated. Use TimerDisplay from components/TimerDisplay.tsx instead.
 *
 * This file is kept for backwards compatibility during migration.
 * It wraps the new TimerDisplay component with the old API.
 */
"use client";

import TimerDisplay from "@/components/TimerDisplay";
import { useTimer } from "@/components/features/timer/hooks/useTimer";

export default function RunningTimerDisplay({ ...props }) {
	const { state, hasSession, actions } = useTimer();

	return <TimerDisplay elapsedTime={state.elapsedTime} status={state.status} onReset={actions.reset} disabled={!hasSession || state.isSaving} {...props} />;
}
