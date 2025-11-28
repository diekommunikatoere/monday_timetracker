-- Migration 008: Add Parent Item to Time Entries
-- Adds parent_item_id and parent_item_name fields

-- Add parent item columns to time_entry table
ALTER TABLE public.time_entry
ADD COLUMN parent_item_id TEXT,
ADD COLUMN parent_item_name TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.time_entry.parent_item_id IS 'ID of the parent item (e.g. Monday.com parent item ID)';
COMMENT ON COLUMN public.time_entry.parent_item_name IS 'Human-readable parent item name for display purposes';

-- Update finalize_time_entry RPC to accept parent item fields
CREATE OR REPLACE FUNCTION finalize_time_entry(
    p_user_id UUID,
    p_draft_id UUID,
    p_task_name TEXT,
    p_comment TEXT,
    p_board_id TEXT DEFAULT NULL,
    p_item_id TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_board_name TEXT DEFAULT NULL,
    p_item_name TEXT DEFAULT NULL,
    p_role_name TEXT DEFAULT NULL,
    p_duration INTEGER DEFAULT NULL,
    p_parent_item_id TEXT DEFAULT NULL, -- New optional parameter
    p_parent_item_name TEXT DEFAULT NULL -- New optional parameter
)
RETURNS jsonb AS $$

DECLARE
  v_session timer_session;
  v_total_duration numeric;
  v_segments jsonb;
  v_updated_session timer_session;
  v_updated_entry time_entry;
BEGIN
  -- Verify ownership: fetch session via draft_id and user_id
  SELECT ts.* INTO v_session
  FROM timer_session ts
  JOIN time_entry te ON ts.draft_id = te.id
  WHERE te.id = p_draft_id AND te.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft not found or access denied for user %', p_user_id;
  END IF;

  -- Step 1: Close any running segments (set end_time = now())
  UPDATE timer_segment
  SET end_time = now()
  WHERE session_id = v_session.id
    AND end_time IS NULL;

  -- Step 2: Compute total duration in seconds from RUNNING segments only (exclude pauses)
  SELECT COALESCE(
    SUM(EXTRACT(epoch FROM (COALESCE(ts.end_time, now()) - ts.start_time))),
    0
  ) INTO v_total_duration
  FROM timer_segment ts
  WHERE ts.session_id = v_session.id;

  -- Override duration if provided
  IF p_duration IS NOT NULL THEN
    v_total_duration := p_duration;
  END IF;

  -- Step 3: Snapshot ALL segments as JSON array (including pauses, ordered by start_time)
  SELECT json_agg(row_to_json(ts) ORDER BY ts.start_time ASC) INTO v_segments
  FROM timer_segment ts
  WHERE ts.session_id = v_session.id;

  -- Step 4: Update timer_session (elapsed_time as int seconds)
  UPDATE timer_session
  SET
    timer_segments = v_segments,
    elapsed_time = v_total_duration::integer,
    is_paused = false
  WHERE id = v_session.id
  RETURNING * INTO v_updated_session;

  -- Step 5: Update time_entry as FINAL entry (is_draft = false)
  UPDATE time_entry
  SET
    task_name = p_task_name,
    end_time = now(),
    duration = v_total_duration::integer,
    comment = p_comment,
    board_id = p_board_id,
    board_name = p_board_name,
    item_id = p_item_id,
    item_name = p_item_name,
    role = p_role,
    role_name = p_role_name,
    parent_item_id = p_parent_item_id,
    parent_item_name = p_parent_item_name,
    is_draft = false,
    timer_session = to_jsonb(v_updated_session)
  WHERE id = p_draft_id
  RETURNING * INTO v_updated_entry;

  -- Return canonical updated records
  RETURN jsonb_build_object(
    'time_entry', row_to_json(v_updated_entry),
    'timer_session', row_to_json(v_updated_session),
    'total_duration_seconds', v_total_duration::integer
  );
END;

$$ LANGUAGE plpgsql SECURITY DEFINER;
