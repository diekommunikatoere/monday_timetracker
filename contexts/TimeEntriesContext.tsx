// contexts/TimeEntriesContext.tsx
import { createContext, useContext, ReactNode } from "react";

interface TimeEntriesContextType {
	refetch: () => void;
}

const TimeEntriesContext = createContext<TimeEntriesContextType | null>(null);

export function TimeEntriesProvider({ children, refetch }: { children: ReactNode; refetch: () => void }) {
	return <TimeEntriesContext.Provider value={{ refetch }}>{children}</TimeEntriesContext.Provider>;
}

export function useTimeEntriesRefetch() {
	const context = useContext(TimeEntriesContext);
	if (!context) {
		throw new Error("useTimeEntriesRefetch must be used within TimeEntriesProvider");
	}
	return context.refetch;
}
