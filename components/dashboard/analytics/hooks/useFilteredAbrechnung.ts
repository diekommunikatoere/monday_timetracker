// components/dashboard/analytics/hooks/useFilteredAbrechnung.ts
"use client";

import Fuse from "fuse.js";
import { useMemo } from "react";

import { useAbrechnungStore } from "@/stores/abrechnungStore";

import type { AbrechnungLinkedItem, AbrechnungTableRow } from "@/types/abrechnung";

/** Fuse only needs string fields; linked project/board names are flattened into one field each. */
interface SearchableBudgetItem {
	/** `${boardId}:${itemId}` — unique across all active boards. */
	key: string;
	name: string;
	/** Every linked Agentur-Projekt name, space-joined, so a project name surfaces its budget item. */
	linkedNames: string;
	/** Every linked project's current board name, space-joined. */
	linkedBoardNames: string;
}

/** A budget board present in `activeBoards`, for the toolbar's Budget-Board `Select`. */
export interface AbrechnungBoardOption {
	id: string;
	name: string;
}

export interface UseFilteredAbrechnungResult {
	/**
	 * `activeBoards` flattened to one row per budget item (see {@link AbrechnungTableRow}),
	 * narrowed by the toolbar's search + board + Auslastung filters, and sorted alphabetically
	 * by item name (board name as a tie-break) — the board is a column here, not a grouping,
	 * so rows from different boards interleave. Each row's `linkedItems` is also sorted
	 * alphabetically. Nothing is ever mutated in place — fresh objects throughout.
	 */
	rows: AbrechnungTableRow[];
	/**
	 * Every board present in `activeBoards`, alphabetically sorted — the toolbar's Budget-Board
	 * `Select` options. Deliberately derived from the **unfiltered** `activeBoards`, not from
	 * `rows`, so picking a board doesn't collapse the dropdown down to just that one option.
	 */
	boardOptions: AbrechnungBoardOption[];
	/** Every status present in `activeBoards`, alphabetically sorted — the toolbar's Status `Select` options. */
	statusOptions: { id: string; name: string }[];
	/** Whether any toolbar filter (search, board, date range, or utilization bound) is currently set. */
	hasActiveFilters: boolean;
	/** `rows.length` — for an optional match-count display. */
	matchCount: number;
}

/**
 * Derives the Abrechnung active-view's visible rows from `useAbrechnungStore`'s
 * `activeBoards` + `filters`, mirroring `useFilteredTimeEntries`'s structure: everything
 * here is client-side and `useMemo`-derived. The one filter that is **not** applied here is
 * the date range — `startDate`/`endDate` already narrowed the rollup server-side (see
 * `lib/abrechnung.ts`), so `activeBoards` itself reflects the selected period by the time
 * it reaches this hook.
 *
 * The search mirrors `useFilteredTimeEntries`'s Fuse setup (`useTokenSearch`,
 * `tokenMatch: "all"`, `threshold: 0.3`, `ignoreLocation`, `minMatchCharLength: 2`), but
 * indexes a budget item's own name plus its linked Agentur-Projekt + board names, so
 * searching a project surfaces the budget item that bills it.
 *
 * Sorting (items/linkedItems, alphabetical by name) also lives here rather than in the
 * page — `AbrechnungPage` previously sorted with `board.items.sort(...)` on a
 * shallow-copied array of boards, which mutated the Zustand store's own item arrays during
 * render. This hook always builds fresh objects instead.
 */
export function useFilteredAbrechnung(): UseFilteredAbrechnungResult {
	const activeBoards = useAbrechnungStore((state) => state.activeBoards);
	const filters = useAbrechnungStore((state) => state.filters);

	const fuseIndex = useMemo(() => {
		const searchable: SearchableBudgetItem[] = activeBoards.flatMap((board) =>
			board.items.map((item) => ({
				key: `${board.boardId}:${item.id}`,
				name: item.name,
				linkedNames: item.linkedItems.map((li) => li.name).join(" "),
				linkedBoardNames: item.linkedItems.map((li) => li.board?.name ?? "").join(" "),
			})),
		);

		return new Fuse(searchable, {
			keys: ["name", "linkedNames", "linkedBoardNames"],
			useTokenSearch: true,
			tokenMatch: "all",
			ignoreLocation: true,
			threshold: 0.3,
			minMatchCharLength: 2,
		});
	}, [activeBoards]);

	const boardOptions = useMemo(() => [...activeBoards].map((board) => ({ id: board.boardId, name: board.boardName })).sort((a, b) => a.name.localeCompare(b.name)), [activeBoards]);

	const statusOptions = useMemo(() => {
		const statusSet = new Set<string>();
		activeBoards.forEach((board) => {
			board.items.forEach((item) => {
				if (item.status?.text) {
					statusSet.add(item.status.text);
				}
			});
		});
		return Array.from(statusSet)
			.sort()
			.map((statusText) => ({ id: statusText, name: statusText }));
	}, [activeBoards]);

	const hasActiveFilters = !!(filters.search.trim() || filters.boardId || filters.status || filters.startDate || filters.endDate || filters.utilizationMin !== null || filters.utilizationMax !== null);

	const rows = useMemo(() => {
		const query = filters.search.trim();
		const matchedKeys = query.length > 0 ? new Set(fuseIndex.search(query).map((hit) => hit.item.key)) : null;
		const hasUtilizationBound = filters.utilizationMin !== null || filters.utilizationMax !== null;

		const sortByName = <T extends { name: string }>(list: T[]): T[] => [...list].sort((a, b) => a.name.localeCompare(b.name));
		const sortLinkedItems = (linkedItems: AbrechnungLinkedItem[]): AbrechnungLinkedItem[] => sortByName(linkedItems);

		const flattened: AbrechnungTableRow[] = activeBoards.flatMap((board) =>
			board.items.map((item) => ({
				...item,
				linkedItems: sortLinkedItems(item.linkedItems),
				boardId: board.boardId,
				boardName: board.boardName,
			})),
		);

		const filtered = flattened.filter((row) => {
			if (filters.boardId && row.boardId !== filters.boardId) return false;
			if (filters.status && row.status?.text !== filters.status) return false;
			if (matchedKeys && !matchedKeys.has(`${row.boardId}:${row.id}`)) return false;
			if (hasUtilizationBound) {
				// "Budget fehlt" (utilizationPercent === null) is excluded whenever a bound is set —
				// there's no percentage to compare it against.
				if (row.utilizationPercent === null) return false;
				if (filters.utilizationMin !== null && row.utilizationPercent < filters.utilizationMin) return false;
				if (filters.utilizationMax !== null && row.utilizationPercent > filters.utilizationMax) return false;
			}
			return true;
		});

		// Primary sort by item name, board name as a tie-break — the board is a display/filter
		// column here, not a grouping key, so rows from different boards interleave.
		return filtered.sort((a, b) => a.name.localeCompare(b.name) || a.boardName.localeCompare(b.boardName));
	}, [activeBoards, filters.search, filters.boardId, filters.status, filters.utilizationMin, filters.utilizationMax, fuseIndex]);

	return { rows, boardOptions, statusOptions, hasActiveFilters, matchCount: rows.length };
}
