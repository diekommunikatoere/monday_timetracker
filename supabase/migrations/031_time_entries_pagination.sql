-- Migration: 031_time_entries_pagination.sql
-- Phase 1 of the time-entries pagination + search/filter plan (see
-- ~/.claude/plans/here-is-a-review-immutable-grove.md). Server-side numbered
-- pagination only — search/filter is Phase 2 (migration 032).
--
-- get_user_time_entries keeps its existing (UUID, INTEGER, INTEGER) signature;
-- only the RETURNS TABLE grows (adds total_count) and the live running timer
-- is now excluded server-side instead of client-side.

-- ============================================
-- 1. get_user_time_entries — add total_count, exclude the running timer
-- ============================================
DROP FUNCTION IF EXISTS public.get_user_time_entries(UUID, INTEGER, INTEGER);

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
    synced_to_monday BOOLEAN,
    timer_state public.timer_state,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    total_count BIGINT
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
        te.synced_to_monday,
        te.timer_state,
        te.created_at,
        te.updated_at,
        COUNT(*) OVER() AS total_count
    FROM public.time_entry te
    LEFT JOIN public.user_profiles up ON te.user_id = up.id
    LEFT JOIN public.monday_board mb ON te.board_id = mb.id
    LEFT JOIN public.monday_item mi ON te.item_id = mi.id
    LEFT JOIN public.monday_item mpi ON mi.parent_item_id = mpi.id
    LEFT JOIN public.role r ON te.role_id = r.id
    WHERE te.user_id = p_user_id
    AND te.deleted_at IS NULL
    AND (mi.id IS NULL OR mi.deleted_at IS NULL)
    AND te.timer_state <> 'running'
    ORDER BY te.start_time DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. Composite index — covers the per-user equality + sort in one
-- ============================================
CREATE INDEX IF NOT EXISTS idx_time_entry_user_start ON public.time_entry (user_id, start_time DESC);
