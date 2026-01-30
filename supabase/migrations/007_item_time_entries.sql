-- supabase/migrations/007_item_time_entries.sql

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
        te.parent_item_id,
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
    LEFT JOIN public.monday_item mpi ON te.parent_item_id = mpi.id
    LEFT JOIN public.role r ON te.role_id = r.id
    WHERE te.item_id = p_item_id
      AND te.board_id = p_board_id
      AND te.deleted_at IS NULL
      AND te.is_draft = FALSE
      AND (p_start_date IS NULL OR te.start_time >= p_start_date)
      AND (p_end_date IS NULL OR te.start_time <= p_end_date)
    ORDER BY te.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
