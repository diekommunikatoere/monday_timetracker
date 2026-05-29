-- Migration: 017_remove_parent_item_id_from_time_entry.sql
-- Description: Remove parent_item_id from time_entry table.
-- The parent relationship is now resolved exclusively via:
--   time_entry.item_id -> monday_item.parent_item_id
-- This eliminates stale data when items are moved between parents.

-- ============================================
-- 1. Drop parent_item_id column from time_entry
-- ============================================

ALTER TABLE public.time_entry DROP COLUMN IF EXISTS parent_item_id;

-- ============================================
-- 2. Update finalize_time_entry RPC to remove parent_item_id from time_entry UPDATE
--    (Keep the monday_item UPSERTs - they still need parent_item_id)
-- ============================================

CREATE OR REPLACE FUNCTION public.finalize_time_entry(
    p_user_id UUID,
    p_draft_id UUID,
    p_task_name TEXT,
    p_comment TEXT,
    p_board_id TEXT DEFAULT NULL,
    p_item_id TEXT DEFAULT NULL,
    p_role_id UUID DEFAULT NULL,
    p_board_name TEXT DEFAULT NULL,
    p_item_name TEXT DEFAULT NULL,
    p_duration INTEGER DEFAULT NULL,
    p_parent_item_id TEXT DEFAULT NULL,
    p_parent_item_name TEXT DEFAULT NULL,
    p_date TIMESTAMPTZ DEFAULT NULL,
    p_is_draft BOOLEAN DEFAULT false
)
RETURNS jsonb AS $$
DECLARE
  v_session public.timer_session;
  v_total_duration numeric;
  v_segments jsonb;
  v_updated_session public.timer_session;
  v_updated_entry public.time_entry;
  v_has_session boolean := false;
  v_start_time timestamptz;
  v_end_time timestamptz;
BEGIN
  -- 1. Update dimension tables if names are provided
  IF p_board_id IS NOT NULL AND p_board_name IS NOT NULL THEN
    INSERT INTO public.monday_board (id, name)
    VALUES (p_board_id, p_board_name)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();
  END IF;

  IF p_item_id IS NOT NULL AND p_item_name IS NOT NULL THEN
    INSERT INTO public.monday_item (id, name, board_id, parent_item_id)
    VALUES (p_item_id, p_item_name, p_board_id, p_parent_item_id)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, board_id = EXCLUDED.board_id, parent_item_id = EXCLUDED.parent_item_id, updated_at = NOW();
  END IF;

  IF p_parent_item_id IS NOT NULL AND p_parent_item_name IS NOT NULL THEN
    INSERT INTO public.monday_item (id, name, board_id)
    VALUES (p_parent_item_id, p_parent_item_name, p_board_id)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, board_id = EXCLUDED.board_id, updated_at = NOW();
  END IF;

  -- 2. Handle Timer Session if exists
  SELECT ts.* INTO v_session
  FROM public.timer_session ts
  WHERE ts.draft_id = p_draft_id;

  v_has_session := FOUND;

  IF v_has_session THEN
    UPDATE public.timer_segment
    SET end_time = now()
    WHERE session_id = v_session.id
      AND end_time IS NULL;

    SELECT COALESCE(
      SUM(EXTRACT(epoch FROM (COALESCE(ts.end_time, now()) - ts.start_time))),
      0
    ) INTO v_total_duration
    FROM public.timer_segment ts
    WHERE ts.session_id = v_session.id;

    SELECT json_agg(row_to_json(ts) ORDER BY ts.start_time ASC) INTO v_segments
    FROM public.timer_segment ts
    WHERE ts.session_id = v_session.id;

    UPDATE public.timer_session
    SET
      timer_segments = v_segments,
      elapsed_time = CASE 
        WHEN COALESCE(p_duration, v_total_duration::integer) > 0 AND COALESCE(p_duration, v_total_duration::integer) < 60 THEN 60
        ELSE COALESCE(p_duration, v_total_duration::integer)
      END,
      is_paused = false
    WHERE id = v_session.id
    RETURNING * INTO v_updated_session;
  END IF;

  -- 3. Calculate times
  IF p_date IS NOT NULL THEN
    v_start_time := p_date;
  ELSE
    SELECT start_time INTO v_start_time FROM public.time_entry WHERE id = p_draft_id;
  END IF;

  IF p_duration IS NOT NULL THEN
    v_total_duration := p_duration;
  ELSE
    v_end_time := now();
    v_total_duration := extract(epoch from (v_end_time - v_start_time))::integer;
  END IF;

  -- Apply rounding logic: 1-59 seconds rounds up to 60
  IF v_total_duration > 0 AND v_total_duration < 60 THEN
    v_total_duration := 60;
  END IF;

  v_end_time := v_start_time + (v_total_duration || ' seconds')::interval;

  -- 4. Update time entry (parent_item_id removed - resolved via monday_item JOIN)
  UPDATE public.time_entry
  SET
    start_time = v_start_time,
    end_time = v_end_time,
    duration = v_total_duration::integer,
    comment = p_comment,
    board_id = p_board_id,
    item_id = p_item_id,
    role_id = p_role_id,
    is_draft = p_is_draft,
    timer_session = CASE
      WHEN v_has_session THEN to_jsonb(v_updated_session)
      ELSE timer_session
    END,
    updated_at = now()
  WHERE id = p_draft_id AND user_id = p_user_id
  RETURNING * INTO v_updated_entry;

  RETURN jsonb_build_object(
    'time_entry', row_to_json(v_updated_entry),
    'timer_session', CASE
      WHEN v_has_session THEN row_to_json(v_updated_session)
      ELSE NULL
    END,
    'total_duration_seconds', v_total_duration::integer
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Update get_item_time_entries RPC to JOIN through monday_item for parent info
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
      AND (p_start_date IS NULL OR te.start_time >= p_start_date)
      AND (p_end_date IS NULL OR te.start_time <= p_end_date)
    ORDER BY te.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Update get_user_time_entries RPC to JOIN through monday_item for parent info
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
    ORDER BY te.start_time DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
