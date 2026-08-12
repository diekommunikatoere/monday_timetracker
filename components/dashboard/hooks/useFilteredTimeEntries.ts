// components/dashboard/hooks/useFilteredTimeEntries.ts
"use client";

import Fuse from "fuse.js";
import { useMemo } from "react";

import { endOfDay, startOfDay } from "@/lib/time/calculations";
import { useTimeEntriesStore } from "@/stores/timeEntriesStore";
import { TimeEntry } from "@/types/time-entry";

/** A distinct role/board present in the user's entries, for the toolbar's filter dropdowns. */
export interface TimeEntriesFilterOption {
	id: string;
	name: string;
}

export interface UseFilteredTimeEntriesResult {
	/** The current page's rows, already search/filter/paginated. */
	pageEntries: TimeEntry[];
	/** Total row count across all pages of the *filtered* result set. */
	total: number;
	/** Total page count for the filtered result set (always >= 1). */
	pageCount: number;
	/** Roles/boards actually present in the user's entries — dropdown options with no dead values. */
	filterOptions: {
		roles: TimeEntriesFilterOption[];
		boards: TimeEntriesFilterOption[];
		timerState: TimeEntriesFilterOption[];
	};
}

/** Fuse only needs string fields; normalizes nullable source fields to `""`. */
interface SearchableEntry {
	id: string;
	task_name: string;
	comment: string;
	parent_item_name: string;
	role_name: string;
	board_name: string;
}

/**
 * Derives the dashboard table's visible page from `useTimeEntriesStore`'s full
 * `allEntries` by applying, in order: tokenized-fuzzy search, role/board/date
 * filters, then client-side pagination. Everything here is `useMemo`-derived —
 * no network I/O (the one bulk load lives in the store's `fetchTimeEntries`).
 *
 * The search mirrors {@link TaskItemSelector}'s Fuse setup
 * (`components/TaskItemSelector.tsx`), matching `task_name`, `comment`,
 * `parent_item_name`, `role_name`, and `board_name` instead of a task tree:
 * `useTokenSearch`/`tokenMatch: "all"` splits the query into words and
 * requires every word to match somewhere across those fields
 * (order-independent), `threshold: 0.3` tolerates typos, and
 * `ignoreLocation` + `minMatchCharLength` match the selector's tuning. Like
 * the selector, this discards Fuse's relevance ranking — matches are reduced
 * to an id `Set` and then used to filter `allEntries` (not the raw hits), so
 * the result stays ordered `start_time DESC`.
 *
 * @returns {@link UseFilteredTimeEntriesResult}.
 */
export function useFilteredTimeEntries(): UseFilteredTimeEntriesResult {
	const { allEntries, filters, page, pageSize } = useTimeEntriesStore();

	const fuseIndex = useMemo(() => {
		const searchable: SearchableEntry[] = allEntries.map((entry) => ({
			id: entry.id,
			task_name: entry.task_name ?? "",
			comment: entry.comment ?? "",
			parent_item_name: entry.parent_item_name ?? "",
			role_name: entry.role_name ?? "",
			board_name: entry.board_name ?? "",
		}));

		return new Fuse(searchable, {
			keys: ["task_name", "comment", "parent_item_name", "role_name", "board_name"],
			useTokenSearch: true,
			tokenMatch: "all",
			ignoreLocation: true,
			threshold: 0.3,
			minMatchCharLength: 2,
		});
	}, [allEntries]);

	const filterOptions = useMemo(() => {
		const roles = new Map<string, string>();
		const boards = new Map<string, string>();

		for (const entry of allEntries) {
			if (entry.role_id && entry.role_name && !roles.has(entry.role_id)) {
				roles.set(entry.role_id, entry.role_name);
			}
			if (entry.board_id && entry.board_name && !boards.has(entry.board_id)) {
				boards.set(entry.board_id, entry.board_name);
			}
		}

		return {
			roles: Array.from(roles, ([id, name]) => ({ id, name })),
			boards: Array.from(boards, ([id, name]) => ({ id, name })),
			timerState: [
				{ id: "finalized", name: "Abgeschlossen" },
				{ id: "parked", name: "Draft" },
			],
		};
	}, [allEntries]);

	const filtered = useMemo(() => {
		const query = filters.search.trim();
		const matchedIds = query.length > 0 ? new Set(fuseIndex.search(query).map((hit) => hit.item.id)) : null;

		const startMs = filters.startDate ? startOfDay(filters.startDate).getTime() : null;
		const endMs = filters.endDate ? endOfDay(filters.endDate).getTime() : null;

		return allEntries.filter((entry) => {
			if (matchedIds && !matchedIds.has(entry.id)) return false;
			if (filters.roleId && entry.role_id !== filters.roleId) return false;
			if (filters.boardId && entry.board_id !== filters.boardId) return false;
			if (filters.timerState && entry.timer_state !== filters.timerState) return false;

			if (startMs !== null || endMs !== null) {
				const entryMs = new Date(entry.start_time).getTime();
				if (startMs !== null && entryMs < startMs) return false;
				if (endMs !== null && entryMs > endMs) return false;
			}

			return true;
		});
	}, [allEntries, filters, fuseIndex]);

	const total = filtered.length;
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const pageEntries = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

	return { pageEntries, total, pageCount, filterOptions };
}
