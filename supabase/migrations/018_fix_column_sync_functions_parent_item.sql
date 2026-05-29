-- Migration: 018_fix_column_sync_functions_parent_item.sql
-- Description: Fix get_item_total_time, get_item_time_by_role, and calculate_remaining_budget
--   functions that still referenced time_entry.parent_item_id (removed in migration 017).
--   Now resolves parent relationship via monday_item.parent_item_id JOIN.

-- ============================================
-- 1. Fix get_item_total_time
-- ============================================
CREATE OR REPLACE FUNCTION public.get_item_total_time(
    p_item_ids TEXT[],
    p_user_id UUID DEFAULT NULL
)
RETURNS BIGINT AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(duration)
         FROM public.time_entry
         WHERE (item_id = ANY(p_item_ids)
                OR item_id IN (
                    SELECT mi.id FROM public.monday_item mi
                    WHERE mi.parent_item_id = ANY(p_item_ids)
                ))
           AND is_draft = false
           AND deleted_at IS NULL
           AND (p_user_id IS NULL OR user_id = p_user_id)),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. Fix get_item_time_by_role
-- ============================================
CREATE OR REPLACE FUNCTION public.get_item_time_by_role(
    p_item_ids TEXT[],
    p_user_id UUID DEFAULT NULL
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
           ))
      AND te.is_draft = false
      AND te.deleted_at IS NULL
      AND (p_user_id IS NULL OR te.user_id = p_user_id)
      AND te.role_id IS NOT NULL
    GROUP BY te.role_id, r.name
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Fix calculate_remaining_budget
-- ============================================
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
        bro.board_id = p_board_id
        AND bro.role_id = te.role_id
        AND bro.is_enabled = true
    )
    WHERE (te.item_id = ANY(p_item_ids)
           OR te.item_id IN (
               SELECT mi.id FROM public.monday_item mi
               WHERE mi.parent_item_id = ANY(p_item_ids)
           ))
      AND te.is_draft = false
      AND te.deleted_at IS NULL
      AND (p_user_id IS NULL OR te.user_id = p_user_id);

    v_remaining := p_budget_amount - v_total_cost;
    v_utilization := CASE 
        WHEN p_budget_amount > 0 THEN (v_total_cost / p_budget_amount) * 100
        ELSE 0
    END;

    RETURN QUERY SELECT p_budget_amount, v_total_cost, v_remaining, v_utilization;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
