-- Migration: 016_rollup_subitem_time
-- Updates RPC functions to include sub-item roll-up when querying a parent item.
-- This ensures that parent items correctly reflect time tracked on their sub-items.

-- Update get_item_total_time to include sub-items
CREATE OR REPLACE FUNCTION get_item_total_time(
    p_item_id TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS BIGINT AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(duration)
         FROM time_entry
         WHERE (item_id = p_item_id OR parent_item_id = p_item_id)
           AND is_draft = false
           AND deleted_at IS NULL
           AND (p_user_id IS NULL OR user_id = p_user_id)),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_item_total_time IS 'Returns total tracked time in seconds for a monday.com item and its sub-items';

-- Update get_item_time_by_role to include sub-items
CREATE OR REPLACE FUNCTION get_item_time_by_role(
    p_item_id TEXT,
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
    FROM time_entry te
    LEFT JOIN role r ON te.role_id = r.id
    WHERE (te.item_id = p_item_id OR te.parent_item_id = p_item_id)
      AND te.is_draft = false
      AND te.deleted_at IS NULL
      AND (p_user_id IS NULL OR te.user_id = p_user_id)
      AND te.role_id IS NOT NULL
    GROUP BY te.role_id, r.name
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_item_time_by_role IS 'Returns total tracked time grouped by role for a monday.com item and its sub-items';

-- Update calculate_remaining_budget to include sub-items
CREATE OR REPLACE FUNCTION calculate_remaining_budget(
    p_board_id TEXT,
    p_item_id TEXT,
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
    -- Calculate total cost from time entries with hourly rates
    -- Includes both the parent item and its sub-items
    SELECT COALESCE(SUM(
        (te.duration / 3600.0) * COALESCE(
            bro.hourly_rate,
            r.hourly_rate,
            0
        )
    ), 0) INTO v_total_cost
    FROM time_entry te
    LEFT JOIN role r ON te.role_id = r.id
    LEFT JOIN board_role_override bro ON (
        bro.board_id = p_board_id
        AND bro.role_id = te.role_id
        AND bro.is_enabled = true
    )
    WHERE (te.item_id = p_item_id OR te.parent_item_id = p_item_id)
      AND te.board_id = p_board_id
      AND te.is_draft = false
      AND te.deleted_at IS NULL
      AND (p_user_id IS NULL OR te.user_id = p_user_id);

    -- Calculate remaining budget and utilization
    v_remaining := p_budget_amount - v_total_cost;
    v_utilization := CASE
        WHEN p_budget_amount > 0 THEN (v_total_cost / p_budget_amount) * 100
        ELSE 0
    END;

    RETURN QUERY SELECT
        p_budget_amount,
        v_total_cost,
        v_remaining,
        v_utilization;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.calculate_remaining_budget IS 'Calculates remaining budget based on tracked time for an item and its sub-items';
