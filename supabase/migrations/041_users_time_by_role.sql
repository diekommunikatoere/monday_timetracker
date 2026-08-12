-- Migration: 041_users_time_by_role.sql
-- Description: Add get_users_time_by_role — a per-USER, per-role time
--              rollup, for the Auswertung dashboard view
--              (components/dashboard/analytics/AuswertungTable.tsx).
--
-- Context: every existing rollup RPC (get_item_total_time, get_item_time_by_role,
-- get_items_time_by_role, calculate_remaining_budget) requires a set of monday
-- item ids as its first argument — they answer "how much time went into this
-- project". Auswertung answers a different question: "how did each person's
-- week split between billable and non-billable work", with no item/board
-- scoping at all. There is no per-user aggregation RPC to build that from, so
-- this adds one.
--
-- Unlike get_items_time_by_role (which resolves the *effective* per-board rate
-- via board_role_override, since it's answering a budget/cost question),
-- Auswertung classifies billability from the *global* role.hourly_rate. It's a
-- cross-board, per-person report; a role's billability reads as a property of
-- the role, not of which board an hour happened to land on. The caller
-- (lib/auswertung.ts) does the billable/non-billable/role-less bucketing —
-- this function only groups and sums, matching the split between SQL
-- aggregation and TypeScript folding used by get_items_time_by_role /
-- lib/abrechnung.ts's rollupBudgetItem.
--
-- Role-less time entries (role_id IS NULL) are NOT filtered out (unlike
-- get_item_time_by_role) — they come back as role_id/role_name/hourly_rate
-- = NULL rows so callers can still fold them into a user's total_seconds
-- while keeping them out of the billable/non-billable split. Filtering them
-- out in SQL would make a user's weekly total understate their actual
-- tracked time, same reasoning as get_items_time_by_role.
--
-- New function, so no DROP/overload conflict — but the 036_revoke_function_execute.sql
-- security posture (search_path pin + service_role-only grant) doesn't apply
-- automatically to a new signature and is asserted below, matching the
-- pattern in 038_calculate_remaining_budget_per_item_board.sql,
-- 039_rollup_functions_date_range.sql and 040_items_time_by_role.sql.

CREATE FUNCTION public.get_users_time_by_role(
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    user_id UUID,
    role_id UUID,
    role_name TEXT,
    role_color_hex TEXT,
    hourly_rate NUMERIC,
    total_seconds BIGINT,
    entry_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.user_id,
        te.role_id,
        r.name AS role_name,
        r.color_hex::TEXT AS role_color_hex,
        r.hourly_rate AS hourly_rate,
        COALESCE(SUM(te.duration), 0)::BIGINT AS total_seconds,
        COUNT(te.id)::BIGINT AS entry_count
    FROM public.time_entry te
    LEFT JOIN public.role r ON te.role_id = r.id
    WHERE te.timer_state = 'finalized'
      AND te.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.monday_item mi_del
          WHERE mi_del.id = te.item_id AND mi_del.deleted_at IS NOT NULL
      )
      AND (p_start_date IS NULL OR te.start_time >= p_start_date)
      AND (p_end_date IS NULL OR te.start_time <= p_end_date)
    GROUP BY te.user_id, te.role_id, r.name, r.color_hex, r.hourly_rate
    ORDER BY 1, total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.get_users_time_by_role(p_start_date timestamptz, p_end_date timestamptz) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_users_time_by_role(p_start_date timestamptz, p_end_date timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_users_time_by_role(p_start_date timestamptz, p_end_date timestamptz) TO service_role;

-- Supporting index: this report range-scans start_time per user, which none
-- of the existing indexes cover (005_indexes.sql only has user_id, role_id,
-- board_item, created_at, deleted_at). Partial on the same predicate every
-- rollup RPC filters on, so it stays small and only ever helps this query shape.
CREATE INDEX IF NOT EXISTS idx_time_entry_user_start_time
    ON public.time_entry (user_id, start_time)
    WHERE timer_state = 'finalized' AND deleted_at IS NULL;
