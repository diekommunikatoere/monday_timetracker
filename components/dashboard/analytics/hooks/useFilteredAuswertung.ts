// components/dashboard/analytics/hooks/useFilteredAuswertung.ts
"use client";

import Fuse from "fuse.js";
import { useMemo } from "react";

import { useAuswertungStore } from "@/stores/auswertungStore";

import type { AuswertungUserRow } from "@/types/auswertung";

/** Fuse only needs the searchable field. */
interface SearchableUserRow {
	userId: string;
	name: string;
}

export interface UseFilteredAuswertungResult {
	/**
	 * The store's `rows`, narrowed by the toolbar's search, and sorted alphabetically
	 * by name. Nothing is ever mutated in place — a fresh, sorted array throughout,
	 * matching the render-time-mutation lesson recorded in `useFilteredAbrechnung`.
	 */
	rows: AuswertungUserRow[];
	/** Whether the search filter is currently set. */
	hasActiveFilters: boolean;
	/** `rows.length` — for an optional match-count display. */
	matchCount: number;
}

/**
 * Derives the Auswertung view's visible rows from `useAuswertungStore`'s `rows` +
 * `filters.search`, mirroring `useFilteredAbrechnung`'s structure: everything here
 * is client-side and `useMemo`-derived. Unlike Abrechnung, the week itself is not
 * filtered here — `weekStart` already narrowed the rollup server-side (see
 * `lib/auswertung.ts`), so `rows` reflects the selected week by the time it
 * reaches this hook.
 *
 * The search mirrors the house Fuse config used by `useFilteredTimeEntries` /
 * `useFilteredAbrechnung` (`useTokenSearch`, `tokenMatch: "all"`, `threshold: 0.3`,
 * `ignoreLocation`, `minMatchCharLength: 2`), indexing just the user's name.
 */
export function useFilteredAuswertung(): UseFilteredAuswertungResult {
	const rows = useAuswertungStore((state) => state.rows);
	const filters = useAuswertungStore((state) => state.filters);

	const fuseIndex = useMemo(() => {
		const searchable: SearchableUserRow[] = rows.map((row) => ({ userId: row.userId, name: row.name }));

		return new Fuse(searchable, {
			keys: ["name"],
			useTokenSearch: true,
			tokenMatch: "all",
			ignoreLocation: true,
			threshold: 0.3,
			minMatchCharLength: 2,
		});
	}, [rows]);

	const hasActiveFilters = !!filters.search.trim();

	const filteredRows = useMemo(() => {
		const query = filters.search.trim();
		const matchedIds = query.length > 0 ? new Set(fuseIndex.search(query).map((hit) => hit.item.userId)) : null;

		const filtered = matchedIds ? rows.filter((row) => matchedIds.has(row.userId)) : [...rows];

		return filtered.sort((a, b) => a.name.localeCompare(b.name));
	}, [rows, filters.search, fuseIndex]);

	return { rows: filteredRows, hasActiveFilters, matchCount: filteredRows.length };
}
