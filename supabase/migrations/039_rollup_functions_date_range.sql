-- Migration: 039_rollup_functions_date_range.sql
-- Description: Add optional p_start_date/p_end_date bounds to the three
--              time-rollup RPCs, for the Abrechnung "Zeitraum" filter
--              (app/dashboards/analytics/abrechnung/page.tsx).
--
-- Context: the Abrechnung view's toolbar lets a user narrow the rollup
-- (Zeit / Agenturleistung / Verbleibend / Auslastung) to a date range —
-- "what did we bill in Q2?" — without touching the configured Budget figure.
-- lib/abrechnung.ts passes the range through to these RPCs; when the range
-- is unset (both NULL) the behavior is exactly the pre-migration one, so
-- every other caller (lib/columnSync.ts's total-time/remaining-budget column
-- sync, which never passes a range) is unaffected.
--
-- Adding parameters changes each function's signature (a new arg is not the
-- same overload as an equivalent DEFAULT-only change once we also touch
-- return/body), so CREATE OR REPLACE is not safe here — PostgREST resolves
-- RPCs by name+signature, and leaving the old 2/2/4-arg signatures in place
-- would make `supabaseAdmin.rpc(name, {...})` calls ambiguous once both
-- overloads exist. Each function is dropped by its exact old signature and
-- recreated fresh. Because the OID changes, the 036_revoke_function_execute.sql
-- security posture (search_path pin + service_role-only grant) does not carry
-- over automatically and is reasserted below for every new signature, matching
-- the pattern established in 038_calculate_remaining_budget_per_item_board.sql.
--
-- Bodies are otherwise byte-for-byte the versions currently live in
-- 029_timer_constraints_and_drops.sql (get_item_total_time, get_item_time_by_role)
-- and 038_calculate_remaining_budget_per_item_board.sql (calculate_remaining_budget,
-- which joins board_role_override on te.board_id, not p_board_id — see that
-- migration's header for why), plus one new predicate pair each:
--   AND (p_start_date IS NULL OR te.start_time >= p_start_date)
--   AND (p_end_date   IS NULL OR te.start_time <= p_end_date)

-- ============================================
-- 1. get_item_total_time
-- ============================================

DROP FUNCTION IF EXISTS public.get_item_total_time(TEXT[], UUID);

CREATE FUNCTION public.get_item_total_time(
    p_item_ids TEXT[],
    p_user_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS BIGINT AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(te.duration)
         FROM public.time_entry te
         WHERE (te.item_id = ANY(p_item_ids)
                OR te.item_id IN (
                    SELECT mi.id FROM public.monday_item mi
                    WHERE mi.parent_item_id = ANY(p_item_ids)
                      AND mi.deleted_at IS NULL
                ))
           AND te.timer_state = 'finalized'
           AND te.deleted_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM public.monday_item mi_del
               WHERE mi_del.id = te.item_id AND mi_del.deleted_at IS NOT NULL
           )
           AND (p_user_id IS NULL OR te.user_id = p_user_id)
           AND (p_start_date IS NULL OR te.start_time >= p_start_date)
           AND (p_end_date IS NULL OR te.start_time <= p_end_date)),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.get_item_total_time(p_item_ids text[], p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_item_total_time(p_item_ids text[], p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_item_total_time(p_item_ids text[], p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) TO service_role;

-- ============================================
-- 2. get_item_time_by_role
-- ============================================

DROP FUNCTION IF EXISTS public.get_item_time_by_role(TEXT[], UUID);

CREATE FUNCTION public.get_item_time_by_role(
    p_item_ids TEXT[],
    p_user_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    role_id UUID,
    role_name TEXT,
    total_seconds BIGINT,
    entry_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.role_id,
        r.name as role_name,
        COALESCE(SUM(te.duration), 0)::BIGINT as total_seconds,
        COUNT(te.id)::BIGINT as entry_count
    FROM public.time_entry te
    LEFT JOIN public.role r ON te.role_id = r.id
    WHERE (te.item_id = ANY(p_item_ids)
           OR te.item_id IN (
               SELECT mi.id FROM public.monday_item mi
               WHERE mi.parent_item_id = ANY(p_item_ids)
                 AND mi.deleted_at IS NULL
           ))
      AND te.timer_state = 'finalized'
      AND te.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.monday_item mi_del
          WHERE mi_del.id = te.item_id AND mi_del.deleted_at IS NOT NULL
      )
      AND (p_user_id IS NULL OR te.user_id = p_user_id)
      AND (p_start_date IS NULL OR te.start_time >= p_start_date)
      AND (p_end_date IS NULL OR te.start_time <= p_end_date)
      AND te.role_id IS NOT NULL
    GROUP BY te.role_id, r.name
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.get_item_time_by_role(p_item_ids text[], p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_item_time_by_role(p_item_ids text[], p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_item_time_by_role(p_item_ids text[], p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) TO service_role;

-- ============================================
-- 3. calculate_remaining_budget
-- ============================================

DROP FUNCTION IF EXISTS public.calculate_remaining_budget(TEXT, TEXT[], NUMERIC, UUID);

CREATE FUNCTION public.calculate_remaining_budget(
    p_board_id TEXT,
    p_item_ids TEXT[],
    p_budget_amount NUMERIC,
    p_user_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    budget_amount NUMERIC,
    total_cost NUMERIC,
    remaining_budget NUMERIC,
    utilization_percent NUMERIC
) AS $$
DECLARE
    v_total_cost NUMERIC := 0;
    v_remaining NUMERIC;
    v_utilization NUMERIC;
BEGIN
    SELECT COALESCE(SUM(
        (te.duration / 3600.0) * COALESCE(
            bro.hourly_rate,
            r.hourly_rate,
            0
        )
    ), 0) INTO v_total_cost
    FROM public.time_entry te
    LEFT JOIN public.role r ON te.role_id = r.id
    LEFT JOIN public.board_role_override bro ON (
        bro.board_id = te.board_id
        AND bro.role_id = te.role_id
        AND bro.is_enabled = true
    )
    WHERE (te.item_id = ANY(p_item_ids)
           OR te.item_id IN (
               SELECT mi.id FROM public.monday_item mi
               WHERE mi.parent_item_id = ANY(p_item_ids)
                 AND mi.deleted_at IS NULL
           ))
      AND te.timer_state = 'finalized'
      AND te.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.monday_item mi_del
          WHERE mi_del.id = te.item_id AND mi_del.deleted_at IS NOT NULL
      )
      AND (p_user_id IS NULL OR te.user_id = p_user_id)
      AND (p_start_date IS NULL OR te.start_time >= p_start_date)
      AND (p_end_date IS NULL OR te.start_time <= p_end_date);

    v_remaining := p_budget_amount - v_total_cost;
    v_utilization := CASE
        WHEN p_budget_amount > 0 THEN (v_total_cost / p_budget_amount) * 100
        ELSE 0
    END;

    RETURN QUERY SELECT p_budget_amount, v_total_cost, v_remaining, v_utilization;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.calculate_remaining_budget(p_board_id text, p_item_ids text[], p_budget_amount numeric, p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.calculate_remaining_budget(p_board_id text, p_item_ids text[], p_budget_amount numeric, p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.calculate_remaining_budget(p_board_id text, p_item_ids text[], p_budget_amount numeric, p_user_id uuid, p_start_date timestamptz, p_end_date timestamptz) TO service_role;
