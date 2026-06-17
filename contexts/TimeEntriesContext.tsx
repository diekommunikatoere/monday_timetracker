// contexts/TimeEntriesContext.tsx
import { createContext, useContext, ReactNode } from "react";

/**
 * Shape of the {@link TimeEntriesContext} value — a single `refetch` callback
 * that descendants can call to reload the time-entries list without being
 * directly coupled to the store or fetch hook above them.
 *
 * @property refetch - Trigger a fresh fetch of the time-entries list.
 */
interface TimeEntriesContextType {
	refetch: () => void;
}

const TimeEntriesContext = createContext<TimeEntriesContextType | null>(null);

/**
 * Provides a `refetch` callback to the subtree so that deeply-nested components
 * (e.g. a timer-finalize button inside a table row) can reload the entries list
 * without prop-drilling the fetch function through every intermediate layer.
 *
 * Pass the refetch function returned by the time-entries store or query hook at
 * the point in the tree that owns the fetch.
 *
 * @param children - Subtree that needs access to the refetch callback.
 * @param refetch  - Function to call when the entries list should be reloaded.
 */
export function TimeEntriesProvider({ children, refetch }: { children: ReactNode; refetch: () => void }) {
	return <TimeEntriesContext.Provider value={{ refetch }}>{children}</TimeEntriesContext.Provider>;
}

/**
 * Returns the `refetch` callback injected by the nearest
 * {@link TimeEntriesProvider}.
 *
 * Use this inside components that trigger entry mutations (finalize, delete,
 * edit) and need to reload the entries list afterwards without owning the fetch
 * themselves.
 *
 * @throws {Error} If called outside a {@link TimeEntriesProvider}.
 * @returns The `refetch` function bound to the enclosing provider.
 */
export function useTimeEntriesRefetch() {
	const context = useContext(TimeEntriesContext);
	if (!context) {
		throw new Error("useTimeEntriesRefetch must be used within TimeEntriesProvider");
	}
	return context.refetch;
}
