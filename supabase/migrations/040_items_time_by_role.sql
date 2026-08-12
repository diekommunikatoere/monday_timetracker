-- Migration: 040_items_time_by_role.sql
-- Description: Add get_items_time_by_role — a per-ITEM, per-role time+cost
--              rollup, for the Abrechnung linked-items drill-down
--              (components/dashboard/analytics/AbrechnungTable.tsx).
--
-- Context: lib/abrechnung.ts needs, per budget item, both (a) a per-role
-- breakdown across all of its linked job items combined (today's
-- get_item_time_by_role) and (b) the same breakdown kept separate per linked
-- job item, plus each linked item's own total time. Before this migration,
-- (b) was approximated with one calculate_remaining_budget RPC call per
-- linked item (N+1) that returned cost only, no time, no per-role split.
--
-- get_items_time_by_role replaces that N+1 with a single call: same input
-- (a set of item ids), but grouped per item instead of collapsed across all
-- of them, and each group carries total_cost using the identical rate
-- expression calculate_remaining_budget uses. get_item_time_by_role itself
-- is left untouched — lib/columnSync.ts's time_by_role column sync still
-- calls it and has no need for the per-item grain.
--
-- Attribution: like the existing rollup RPCs, a job item's own entries and
-- its subitems' entries are attributed to the job item. Because this
-- function groups per item (rather than collapsing everything into one
-- row), that attribution has to be resolved explicitly per row via a join
-- back to monday_item, instead of just OR-ing subitem ids into the WHERE.
--
-- Role-less time entries (role_id IS NULL) are NOT filtered out here (unlike
-- get_item_time_by_role) — they come back as role_id/role_name = NULL rows
-- so callers can still fold them into each item's total_seconds/total_cost,
-- and exclude them from the per-role breakdown themselves. Filtering them
-- out in SQL would make a linked item's total time understate its board's
-- own numbers.
--
-- New function, so no DROP/overload conflict — but the 036_revoke_function_execute.sql
-- security posture (search_path pin + service_role-only grant) doesn't apply
-- automatically to a new signature and is asserted below, matching the
-- pattern in 038_calculate_remaining_budget_per_item_board.sql and
-- 039_rollup_functions_date_range.sql.

CREATE FUNCTION public.get_items_time_by_role(
    p_item_ids TEXT[],
    p_user_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    item_id TEXT,
    role_id UUID,
    role_name TEXT,
    total_seconds BIGINT,
    total_cost NUMERIC,
    entry_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE WHEN te.item_id = ANY(p_item_ids) THEN te.item_id ELSE mi_p.parent_item_id END AS item_id,
        te.role_id,
        r.name AS role_name,
        COALESCE(SUM(te.duration), 0)::BIGINT AS total_seconds,
        COALESCE(SUM(
            (te.duration / 3600.0) * COALESCE(
                bro.hourly_rate,
                r.hourly_rate,
                0
            )
        ), 0) AS total_cost,
        COUNT(te.id)::BIGINT AS entry_count
    FROM public.time_entry te
    LEFT JOIN public.role r ON te.role_id = r.id
    LEFT JOIN public.board_role_override bro ON (
        bro.board_id = te.board_id
        AND bro.role_id = te.role_id
        AND bro.is_enabled = true
    )
    LEFT JOIN public.monday_item mi_p ON mi_p.id = te.item_id AND mi_p.deleted_at IS NULL
    WHERE (te.item_id = ANY(p_item_ids) OR mi_p.parent_item_id = ANY(p_item_ids))
      AND te.timer_state = 'finalized'
      AND te.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.monday_item mi_del
          WHERE mi_del.id = te.item_id AND mi_del.deleted_at IS NOT NULL
      )
      AND (p_user_id IS NULL OR te.user_id = p_user_id)
      AND (p_start_date IS NULL OR te.start_time >= p_start_date)
      AND (p_end_date IS NULL OR te.start_time <= p_end_date)
    GROUP BY CASE WHEN te.item_id = ANY(p_item_ids) THEN te.item_id ELSE mi_p.parent_item_id END, te.role_id, r.name
    ORDER BY 1, total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.get_items_time_by_role(p_item_ids text[], p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_items_time_by_role(p_item_ids text[], p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_items_time_by_role(p_item_ids text[], p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) TO service_role;
