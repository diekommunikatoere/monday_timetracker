-- Migration: 038_calculate_remaining_budget_per_item_board.sql
-- Description: Fix calculate_remaining_budget to apply each time entry's OWN
--              board's role-rate override, instead of a single board-wide override
--              for the whole call.
--
-- Context (Abrechnung / budget rollup feature): calculate_remaining_budget is fed
-- a budget item's full set of linked job-item IDs (p_item_ids), which may span
-- several different job boards (a budget item on the "Retainer" board can link
-- job items living on multiple project boards). The board_role_override join
-- previously used `bro.board_id = p_board_id` — a single board ID for the whole
-- call — so once linked items span more than one board, every row silently got
-- the override for whichever board happened to be passed in p_board_id (or none
-- at all), regardless of which board a given time_entry's item actually lives on.
--
-- Fix: join board_role_override on the time entry's own board (`te.board_id`)
-- instead of the caller-supplied p_board_id. p_board_id is no longer read inside
-- the function body, but the parameter is left in place (see below) so the
-- signature — and therefore every existing caller and grant — is unchanged.
--
-- Signature is unchanged (same name, same parameters, same return type), so:
-- - Existing callers (lib/columnSync.ts's calculateRemainingBudget) are unaffected.
-- - Grants are unaffected — GRANT/REVOKE (proacl) attach to the function's OID and
--   are preserved by CREATE OR REPLACE FUNCTION when the signature doesn't change.
-- - However, CREATE OR REPLACE FUNCTION does NOT reliably retain a previously
--   ALTER'd `SET search_path` (a proconfig property) unless it's re-specified, so
--   the ALTER FUNCTION / REVOKE / GRANT lines from 036_revoke_function_execute.sql
--   are reasserted below to guarantee the locked-down security posture survives
--   this redefinition.

CREATE OR REPLACE FUNCTION public.calculate_remaining_budget(
    p_board_id TEXT,
    p_item_ids TEXT[],
    p_budget_amount NUMERIC,
    p_user_id UUID DEFAULT NULL
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
      AND (p_user_id IS NULL OR te.user_id = p_user_id);

    v_remaining := p_budget_amount - v_total_cost;
    v_utilization := CASE
        WHEN p_budget_amount > 0 THEN (v_total_cost / p_budget_amount) * 100
        ELSE 0
    END;

    RETURN QUERY SELECT p_budget_amount, v_total_cost, v_remaining, v_utilization;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reassert the 036 security posture (see comment above) — CREATE OR REPLACE above
-- doesn't guarantee proconfig (search_path) survives, so pin it again here.
ALTER FUNCTION public.calculate_remaining_budget(p_board_id text, p_item_ids text[], p_budget_amount numeric, p_user_id uuid) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.calculate_remaining_budget(p_board_id text, p_item_ids text[], p_budget_amount numeric, p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.calculate_remaining_budget(p_board_id text, p_item_ids text[], p_budget_amount numeric, p_user_id uuid) TO service_role;
