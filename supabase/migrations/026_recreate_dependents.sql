-- Migration: 026_recreate_dependents.sql
-- Wave 1 (live-safe) of the timer 2-table redesign — see docs/timer-redesign.md §5.
--
-- Evolves the one read function the new app needs before it can be deployed:
-- get_user_time_entries, which feeds the entries table (the only read surface that shows
-- non-finalized rows and that selected the soon-to-be-dropped time_entry.timer_session jsonb).
--
-- This migration is deliberately NARROW and live-safe:
--   * It ADDS a timer_state column to the output (so the new app can drive draft-row styling
--     off timer_state instead of is_draft) and DROPS the timer_session jsonb from the output
--     (O4: no active client reads it).
--   * It KEEPS is_draft in the output and does NOT change any is_draft filter, so the
--     currently-deployed app keeps working unchanged while Wave 1 runs.
--
-- What is intentionally NOT done here (cannot run while the old app is live):
--   * Swapping the is_draft filter to timer_state on get_item_time_entries / get_item_total_time
--     / get_item_time_by_role / calculate_remaining_budget — done in 027, after a final backfill
--     and once the new app is deployed.
--   * Dropping the legacy timer functions (get_timer_session_with_elapsed is still called on every
--     app load; finalize_segment / finalize_draft / etc.) — done in 028 with the timer_session table.
--
-- The return type changes, so the function must be dropped and recreated (CREATE OR REPLACE
-- cannot change a RETURNS TABLE signature). The argument signature is unchanged, so RPC calls
-- by name keep resolving.

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
    is_draft BOOLEAN,
    synced_to_monday BOOLEAN,
    timer_state public.timer_state,
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
        -- timer_state is backfilled in 024; for rows written by the old app during the Wave 1
        -- window (is_draft set, timer_state still NULL) derive it so the output is correct
        -- before 027's final backfill. The COALESCE is removed in 027 when is_draft is dropped.
        COALESCE(
            te.timer_state,
            CASE WHEN te.is_draft THEN 'parked'::public.timer_state ELSE 'finalized'::public.timer_state END
        ) as timer_state,
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
