-- Migration: function_get_user_time_entries
-- Retrieves time entries for a specific user with pagination
-- Returns entries ordered by start_time descending (newest first)

CREATE OR REPLACE FUNCTION get_user_time_entries(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
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
        te.task_name,
        te.start_time,
        te.end_time,
        te.duration,
        te.board_id,
        te.board_name,
        te.item_id,
        te.item_name,
        te.parent_item_id,
        te.parent_item_name,
        te.role_id,
        te.comment,
        te.is_draft,
        te.synced_to_monday,
        te.timer_session,
        te.created_at,
        te.updated_at
    FROM time_entry te
    WHERE te.user_id = p_user_id
    ORDER BY te.start_time DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: function_create_timer_session
-- Creates a new timer session with an associated draft time entry
-- Returns the created session and draft IDs

CREATE OR REPLACE FUNCTION create_timer_session(
    p_user_id UUID
)
RETURNS jsonb AS $$
DECLARE
    v_draft_id UUID;
    v_session_id UUID;
BEGIN
    -- Create draft time entry
    INSERT INTO time_entry (user_id, is_draft)
    VALUES (p_user_id, true)
    RETURNING id INTO v_draft_id;

    -- Create timer session linked to draft
    INSERT INTO timer_session (user_id, draft_id, elapsed_time, is_paused)
    VALUES (p_user_id, v_draft_id, 0, false)
    RETURNING id INTO v_session_id;

    -- Return both IDs
    RETURN jsonb_build_object(
        'draft_id', v_draft_id,
        'session_id', v_session_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration: function_get_active_timer_session
-- Retrieves the active timer session for a user
-- Returns NULL if no active session exists

CREATE OR REPLACE FUNCTION get_active_timer_session(
    p_user_id UUID
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    draft_id UUID,
    start_time TIMESTAMPTZ,
    elapsed_time INTEGER,
    is_paused BOOLEAN,
    timer_segments JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ts.id,
        ts.user_id,
        ts.draft_id,
        ts.start_time,
        ts.elapsed_time,
        ts.is_paused,
        ts.timer_segments,
        ts.created_at,
        ts.updated_at
    FROM timer_session ts
    WHERE ts.user_id = p_user_id
    AND EXISTS (
        SELECT 1 FROM time_entry te
        WHERE te.id = ts.draft_id
        AND te.is_draft = true
    )
    ORDER BY ts.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;-- Migration: function_finalize_time_entry
-- Finalizes a draft as a completed time entry (is_draft = false)
-- Includes monday.com integration fields and optional parameters
-- Allows finalizing draft entries that don't have an active session

CREATE OR REPLACE FUNCTION finalize_time_entry(
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
    p_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS jsonb AS $$

DECLARE
  v_session timer_session;
  v_total_duration numeric;
  v_segments jsonb;
  v_updated_session timer_session;
  v_updated_entry time_entry;
  v_has_session boolean := false;
  v_end_time timestamptz;
BEGIN
  -- Verify ownership: check if draft exists and belongs to user
  IF NOT EXISTS (
    SELECT 1 FROM time_entry
    WHERE id = p_draft_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Draft not found or access denied for user %', p_user_id;
  END IF;

  -- Try to fetch session via draft_id (may not exist for old drafts)
  SELECT ts.* INTO v_session
  FROM timer_session ts
  WHERE ts.draft_id = p_draft_id;

  v_has_session := FOUND;

  -- If session exists, process segments
  IF v_has_session THEN
    -- Step 1: Close any running segments (set end_time = now())
    UPDATE timer_segment
    SET end_time = now()
    WHERE session_id = v_session.id
      AND end_time IS NULL;

    -- Step 2: Compute total duration in seconds from RUNNING segments only
    SELECT COALESCE(
      SUM(EXTRACT(epoch FROM (COALESCE(ts.end_time, now()) - ts.start_time))),
      0
    ) INTO v_total_duration
    FROM timer_segment ts
    WHERE ts.session_id = v_session.id;

    -- Step 3: Snapshot ALL segments as JSON array
    SELECT json_agg(row_to_json(ts) ORDER BY ts.start_time ASC) INTO v_segments
    FROM timer_segment ts
    WHERE ts.session_id = v_session.id;

    -- Step 4: Update timer_session
    UPDATE timer_session
    SET
      timer_segments = v_segments,
      elapsed_time = COALESCE(p_duration, v_total_duration::integer),
      is_paused = false
    WHERE id = v_session.id
    RETURNING * INTO v_updated_session;
  END IF;

  -- Override duration if provided, otherwise use calculated duration
  IF p_duration IS NOT NULL THEN
    v_total_duration := p_duration;
  ELSIF NOT v_has_session THEN
    -- If no session and no duration provided, this is an error
    RAISE EXCEPTION 'Duration must be provided when finalizing a draft without a session';
  END IF;

  -- Determine end time: use provided date or now()
  v_end_time := COALESCE(p_date, now());

  -- Step 5: Update time_entry as FINAL entry (is_draft = false)
  UPDATE time_entry
  SET
    task_name = p_task_name,
    end_time = v_end_time,
    duration = v_total_duration::integer,
    comment = p_comment,
    board_id = p_board_id,
    board_name = p_board_name,
    item_id = p_item_id,
    item_name = p_item_name,
    role_id = p_role_id,
    parent_item_id = p_parent_item_id,
    parent_item_name = p_parent_item_name,
    is_draft = false,
    timer_session = CASE
      WHEN v_has_session THEN to_jsonb(v_updated_session)
      ELSE timer_session -- Keep existing session data if any
    END
  WHERE id = p_draft_id
  RETURNING * INTO v_updated_entry;

  -- Return canonical updated records
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

-- Migration: function_soft_reset_timer
-- Soft resets a timer by creating a new draft and session
-- Keeps the old time entry but marks it as finalized
-- Used when user wants to start a new timer without saving the current one

CREATE OR REPLACE FUNCTION soft_reset_timer(
    p_user_id UUID,
    p_old_draft_id UUID,
    p_old_session_id UUID
)
RETURNS jsonb AS $$
DECLARE
    v_new_draft_id UUID;
    v_new_session_id UUID;
BEGIN
    -- Verify ownership of old draft
    IF NOT EXISTS (
        SELECT 1 FROM time_entry
        WHERE id = p_old_draft_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Draft not found or access denied';
    END IF;

    -- Create new draft
    INSERT INTO time_entry (user_id, is_draft)
    VALUES (p_user_id, true)
    RETURNING id INTO v_new_draft_id;

    -- Create new session
    INSERT INTO timer_session (user_id, draft_id, elapsed_time, is_paused)
    VALUES (p_user_id, v_new_draft_id, 0, false)
    RETURNING id INTO v_new_session_id;

    -- Return new IDs
    RETURN jsonb_build_object(
        'draft_id', v_new_draft_id,
        'session_id', v_new_session_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Migration: function_get_item_time_by_role
-- Aggregates time entries by role for a specific item
-- Optionally filters by user
-- Returns role breakdown with total seconds and entry count

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
    WHERE te.item_id = p_item_id
      AND te.is_draft = false
      AND (p_user_id IS NULL OR te.user_id = p_user_id)
      AND te.role_id IS NOT NULL
    GROUP BY te.role_id, r.name
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;