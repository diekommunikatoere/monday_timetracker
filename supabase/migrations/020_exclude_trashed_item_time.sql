-- Migration: 020_exclude_trashed_item_time.sql
-- Description: Exclude time entries belonging to trashed monday_items
--   (monday_item.deleted_at IS NOT NULL) from overviews and budget calculations.
--   Trashed items are restorable for ~30 days; their tracked time must not count
--   toward budgets or appear in overviews while trashed, but is preserved until the
--   31-day purge (see migration 019 + the purge job). monday_item.deleted_at is the
--   single source of truth — time_entry.deleted_at remains the user-undo mechanism.

-- ============================================
-- 1. get_item_total_time — exclude trashed items + trashed subitems
-- ============================================
CREATE OR REPLACE FUNCTION public.get_item_total_time(
    p_item_ids TEXT[],
    p_user_id UUID DEFAULT NULL
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
           AND te.is_draft = false
           AND te.deleted_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM public.monday_item mi_del
               WHERE mi_del.id = te.item_id AND mi_del.deleted_at IS NOT NULL
           )
           AND (p_user_id IS NULL OR te.user_id = p_user_id)),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. get_item_time_by_role — exclude trashed items + trashed subitems
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
                 AND mi.deleted_at IS NULL
           ))
      AND te.is_draft = false
      AND te.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.monday_item mi_del
          WHERE mi_del.id = te.item_id AND mi_del.deleted_at IS NOT NULL
      )
      AND (p_user_id IS NULL OR te.user_id = p_user_id)
      AND te.role_id IS NOT NULL
    GROUP BY te.role_id, r.name
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. calculate_remaining_budget — exclude trashed items + trashed subitems
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
                 AND mi.deleted_at IS NULL
           ))
      AND te.is_draft = false
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

-- ============================================
-- 4. get_item_time_entries — hide entries whose item is trashed
-- ============================================
CREATE OR REPLACE FUNCTION public.get_item_time_entries(
    p_item_id TEXT,
    p_board_id TEXT,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    user_name TEXT,
    user_photo_urls JSONB,
    task_name TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration INTEGER,
    board_id TEXT,
    board_name TEXT,
    item_id TEXT,
    item_name TEXT,
    parent_item_id TEXT,
    parent_item_name TEXT,
    role_id UUID,
    role_name TEXT,
    comment TEXT,
    is_draft BOOLEAN,
    synced_to_monday BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.id,
        te.user_id,
        up.name as user_name,
        up.photo_urls as user_photo_urls,
        COALESCE(mi.name, 'Unzugeordneter Zeiteintrag') as task_name,
        te.start_time,
        te.end_time,
        te.duration,
        te.board_id,
        mb.name as board_name,
        te.item_id,
        mi.name as item_name,
        mi.parent_item_id,
        mpi.name as parent_item_name,
        te.role_id,
        r.name as role_name,
        te.comment,
        te.is_draft,
        te.synced_to_monday,
        te.created_at,
        te.updated_at
    FROM public.time_entry te
    LEFT JOIN public.user_profiles up ON te.user_id = up.id
    LEFT JOIN public.monday_board mb ON te.board_id = mb.id
    LEFT JOIN public.monday_item mi ON te.item_id = mi.id
    LEFT JOIN public.monday_item mpi ON mi.parent_item_id = mpi.id
    LEFT JOIN public.role r ON te.role_id = r.id
    WHERE te.item_id = p_item_id
      AND te.board_id = p_board_id
      AND te.deleted_at IS NULL
      AND te.is_draft = FALSE
      AND (mi.id IS NULL OR mi.deleted_at IS NULL)
      AND (p_start_date IS NULL OR te.start_time >= p_start_date)
      AND (p_end_date IS NULL OR te.start_time <= p_end_date)
    ORDER BY te.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. get_user_time_entries — hide entries whose item is trashed
-- ============================================
CREATE OR REPLACE FUNCTION public.get_user_time_entries(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    user_name TEXT,
    user_photo_urls JSONB,
    task_name TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration INTEGER,
    board_id TEXT,
    board_name TEXT,
    item_id TEXT,
    item_name TEXT,
    parent_item_id TEXT,
    parent_item_name TEXT,
    role_id UUID,
    role_name TEXT,
    comment TEXT,
    is_draft BOOLEAN,
    synced_to_monday BOOLEAN,
    timer_session JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.id,
        te.user_id,
        up.name as user_name,
        up.photo_urls as user_photo_urls,
        COALESCE(mi.name, 'Unzugeordneter Zeiteintrag') as task_name,
        te.start_time,
        te.end_time,
        te.duration,
        te.board_id,
        mb.name as board_name,
        te.item_id,
        mi.name as item_name,
        mi.parent_item_id,
        mpi.name as parent_item_name,
        te.role_id,
        r.name as role_name,
        te.comment,
        te.is_draft,
        te.synced_to_monday,
        te.timer_session,
        te.created_at,
        te.updated_at
    FROM public.time_entry te
    LEFT JOIN public.user_profiles up ON te.user_id = up.id
    LEFT JOIN public.monday_board mb ON te.board_id = mb.id
    LEFT JOIN public.monday_item mi ON te.item_id = mi.id
    LEFT JOIN public.monday_item mpi ON mi.parent_item_id = mpi.id
    LEFT JOIN public.role r ON te.role_id = r.id
    WHERE te.user_id = p_user_id
    AND te.deleted_at IS NULL
    AND (mi.id IS NULL OR mi.deleted_at IS NULL)
    ORDER BY te.start_time DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
