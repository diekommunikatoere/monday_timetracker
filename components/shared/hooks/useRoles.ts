// components/shared/hooks/useRoles.ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

/**
 * A selectable billing role, shaped for direct use as `Select`/`ComboboxItem` data.
 *
 * @property label - Display name (`role.name`).
 * @property value - Supabase `role.id` (UUID).
 */
export interface RoleOption {
	label: string;
	value: string;
}

/**
 * Options for {@link useRoles}.
 *
 * @property usageCounts - Optional per-role usage map (e.g. assignment counts for
 *   the current user) used as the **primary** sort key, descending — the highest-
 *   usage role sorts first. Roles missing from the map count as `0`. Alphabetical
 *   order (`localeCompare`, German-aware) is always the tiebreak / default when
 *   this is omitted. **Not populated by any call site yet** — this is the seam for
 *   a future usage-based ordering feature; passing it already works.
 */
export interface UseRolesOptions {
	usageCounts?: Record<string, number>;
}

/**
 * Shared fetch for the selectable billing `role`s, used by every role `Select`
 * across the app (dashboard `TaskItemSelector`, sidebar `ItemManualEntryModal`).
 *
 * Centralizing this hook is the fix for a real bug: the two call sites used to
 * run independent `useQuery(["roles"])` calls with different `queryFn`s — one
 * filtered inactive roles and sorted, the other did neither — so the sidebar
 * dropdown was unsorted and included inactive roles while the dashboard wasn't.
 * Sharing the query key `["roles"]` across call sites also means they now share
 * one cache entry instead of racing to populate it differently.
 *
 * Always filters out `is_active === false` roles, then sorts by
 * `usageCounts` (descending, when provided) with `name.localeCompare` as the
 * tiebreak and default — `localeCompare` correctly orders German umlauts
 * (ä/ö/ü), which Postgres' default collation may not.
 *
 * @param options - {@link UseRolesOptions}; `usageCounts` is optional and unused by any call site today.
 * @returns `{ roles, isLoading }` — `roles` is `[]` until loaded.
 */
export function useRoles(options?: UseRolesOptions) {
	const { usageCounts } = options ?? {};

	const { data: roles = [], isLoading } = useQuery({
		queryKey: ["roles"],
		queryFn: async (): Promise<RoleOption[]> => {
			const { data, error } = await supabase.from("role").select("*");
			if (error) throw error;
			return data
				.filter((role) => role.is_active)
				.sort((a, b) => {
					if (usageCounts) {
						const usageDiff = (usageCounts[b.id] ?? 0) - (usageCounts[a.id] ?? 0);
						if (usageDiff !== 0) return usageDiff;
					}
					return a.name.localeCompare(b.name);
				})
				.map((role) => ({
					label: role.name,
					value: role.id,
				}));
		},
		// OPTIMIZATION: Roles change very infrequently
		staleTime: 30 * 60 * 1000, // 30 minutes
		gcTime: 60 * 60 * 1000, // 1 hour
		refetchOnWindowFocus: false,
		refetchOnMount: false,
	});

	return { roles, isLoading };
}
