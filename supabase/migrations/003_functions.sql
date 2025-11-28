-- Migration: 003_functions.sql
-- All functions (lexical filename order)
-- Migration: function_add_default_roles
-- Inserts default role options

CREATE OR REPLACE FUNCTION add_default_roles()
RETURNS void AS $$
BEGIN
    INSERT INTO public.role (name, description)
    VALUES
        ('Geschäftsführung', 'Leitung und strategische Entscheidungen'),
        ('Projektleitung', 'Projektmanagement und Teamführung'),
        ('Assistenz', 'Unterstützung der Geschäftsführung und Teams'),
        ('Graphik', 'Graphikdesign und Multimedia'),
        ('Webentwicklung', 'Webentwicklung und Programmierung'),
        ('Medical Writing', 'Medizinische Fachtexte und Dokumentation'),
        ('Copy Writing', 'Texterstellung und Content Marketing'),
        ('Social Media', 'Social Media Management und Marketing'),
        ('SEO/SEA/GEO', 'Suchmaschinenoptimierung, Suchmaschinenwerbung und KI-Optimierung'),
        ('Meeting', 'Meetings und Calls'),
        ('Intern oder Akquise', 'Interne Aufgaben, Akquise oder Weiterbildung')
    ON CONFLICT (name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;-- Migration: function_finalize_draft
-- Finalizes a draft time entry (keeps is_draft = true)
-- Computes total duration, snapshots segments

CREATE OR REPLACE FUNCTION finalize_draft(
    p_user_id UUID,
    p_draft_id UUID,
    p_task_name TEXT,
    p_comment TEXT
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
  -- Uses COALESCE(end_time, now()) for any still-running (should be none after step 1)
  SELECT COALESCE(
    SUM(EXTRACT(epoch FROM (COALESCE(ts.end_time, now()) - ts.start_time))),
    0
  ) INTO v_total_duration
  FROM timer_segment ts
  WHERE ts.session_id = v_session.id;

  -- Step 3: Snapshot ALL segments as JSON array (including pauses, ordered by start_time)
  SELECT json_agg(row_to_json(ts) ORDER BY ts.start_time ASC) INTO v_segments
  FROM timer_segment ts
  WHERE ts.session_id = v_session.id;

  -- Step 4: Update timer_session (elapsed_time as int seconds)
  UPDATE timer_session
  SET
    timer_segments = v_segments,
    elapsed_time = v_total_duration::integer,
    is_paused = false  -- Ensure paused=false on finalize
  WHERE id = v_session.id
  RETURNING * INTO v_updated_session;

  -- Step 5: Update time_entry (keep is_draft=true per current hook behavior)
  UPDATE time_entry
  SET
    task_name = p_task_name,
    end_time = now(),
    duration = v_total_duration::integer,  -- seconds
    comment = p_comment,
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
$$ LANGUAGE plpgsql SECURITY DEFINER;-- Migration: function_finalize_segment
-- Closes open timer segments and updates session elapsed time
-- Returns: { elapsed_time_ms: integer, duration_added_ms: integer }

CREATE OR REPLACE FUNCTION finalize_segment(p_session_id UUID)
RETURNS jsonb AS $$
DECLARE
  v_duration_ms BIGINT;
  v_elapsed_ms INTEGER;
BEGIN
  -- Close open segments atomically, compute total duration added
  WITH closed_segments AS (
    UPDATE timer_segment
    SET
      end_time = now(),
      duration = EXTRACT(EPOCH FROM (now() - start_time)) * 1000::BIGINT
    WHERE session_id = p_session_id AND end_time IS NULL
    RETURNING EXTRACT(EPOCH FROM (now() - start_time)) * 1000::BIGINT AS seg_duration_ms
  )
  SELECT COALESCE(SUM(seg_duration_ms), 0) INTO v_duration_ms
  FROM closed_segments;

  -- Update session elapsed_time += total_duration (0 if none closed)
  UPDATE timer_session
  SET elapsed_time = elapsed_time + v_duration_ms::INTEGER
  WHERE id = p_session_id
  RETURNING elapsed_time INTO v_elapsed_ms;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timer session not found: %', p_session_id;
  END IF;

  -- Set is_paused to true
  UPDATE timer_session
  SET is_paused = true
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'elapsed_time_ms', v_elapsed_ms,
    'duration_added_ms', v_duration_ms
  );
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
    p_role TEXT DEFAULT NULL,
    p_board_name TEXT DEFAULT NULL,
    p_item_name TEXT DEFAULT NULL,
    p_role_name TEXT DEFAULT NULL,
    p_duration INTEGER DEFAULT NULL,
    p_parent_item_id TEXT DEFAULT NULL,
    p_parent_item_name TEXT DEFAULT NULL,
    p_date TIMESTAMPTZ DEFAULT NULL -- New optional parameter for custom date
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
    role = p_role,
    role_name = p_role_name,
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

$$ LANGUAGE plpgsql SECURITY DEFINER;-- Migration: function_get_current_elapsed_time
-- Calculates elapsed time entirely on the database server to avoid clock drift
-- between the app server/browser and the database server

CREATE OR REPLACE FUNCTION get_current_elapsed_time(p_session_id UUID)
RETURNS jsonb AS $$
DECLARE
    v_session timer_session;
    v_current_segment_duration BIGINT;
    v_total_elapsed BIGINT;
    v_server_time TIMESTAMPTZ;
BEGIN
    -- Get current database server time
    v_server_time := NOW();

    -- Fetch the session
    SELECT * INTO v_session
    FROM timer_session
    WHERE id = p_session_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'elapsed_time_ms', 0,
            'server_time', v_server_time,
            'error', 'Session not found'
        );
    END IF;

    -- Start with the stored elapsed time
    v_total_elapsed := v_session.elapsed_time;

    -- If session is running (not paused), add time from current open segment
    IF NOT v_session.is_paused THEN
        SELECT COALESCE(
            EXTRACT(EPOCH FROM (v_server_time - seg.start_time)) * 1000,
            0
        )::BIGINT INTO v_current_segment_duration
        FROM timer_segment seg
        WHERE seg.session_id = p_session_id
            AND seg.end_time IS NULL
        ORDER BY seg.start_time DESC
        LIMIT 1;

        -- Add current segment duration (if any)
        v_total_elapsed := v_total_elapsed + COALESCE(v_current_segment_duration, 0);
    END IF;

    RETURN jsonb_build_object(
        'elapsed_time_ms', v_total_elapsed,
        'server_time', v_server_time,
        'is_paused', v_session.is_paused,
        'stored_elapsed_time_ms', v_session.elapsed_time
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;-- Migration: function_get_timer_session_with_elapsed
-- Returns a complete session with calculated elapsed time
-- Useful for the session API endpoint

CREATE OR REPLACE FUNCTION get_timer_session_with_elapsed(p_user_id UUID)
RETURNS jsonb AS $$
DECLARE
    v_session timer_session;
    v_time_entry time_entry;
    v_current_segment_duration BIGINT;
    v_total_elapsed BIGINT;
    v_server_time TIMESTAMPTZ;
BEGIN
    -- Get current database server time
    v_server_time := NOW();

    -- Fetch the session for this user
    SELECT * INTO v_session
    FROM timer_session
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'session', NULL,
            'server_time', v_server_time
        );
    END IF;

    -- Fetch the associated time entry (draft)
    SELECT * INTO v_time_entry
    FROM time_entry
    WHERE id = v_session.draft_id;

    -- Start with the stored elapsed time
    v_total_elapsed := v_session.elapsed_time;

    -- If session is running (not paused), add time from current open segment
    IF NOT v_session.is_paused THEN
        SELECT COALESCE(
            EXTRACT(EPOCH FROM (v_server_time - seg.start_time)) * 1000,
            0
        )::BIGINT INTO v_current_segment_duration
        FROM timer_segment seg
        WHERE seg.session_id = v_session.id
            AND seg.end_time IS NULL
        ORDER BY seg.start_time DESC
        LIMIT 1;

        -- Add current segment duration (if any)
        v_total_elapsed := v_total_elapsed + COALESCE(v_current_segment_duration, 0);
    END IF;

    RETURN jsonb_build_object(
        'session', jsonb_build_object(
            'id', v_session.id,
            'user_id', v_session.user_id,
            'draft_id', v_session.draft_id,
            'start_time', v_session.start_time,
            'elapsed_time', v_session.elapsed_time,
            'is_paused', v_session.is_paused,
            'created_at', v_session.created_at,
            'time_entry', CASE
                WHEN v_time_entry IS NOT NULL THEN jsonb_build_object(
                    'id', v_time_entry.id,
                    'comment', v_time_entry.comment
                )
                ELSE NULL
            END
        ),
        'calculated_elapsed_time_ms', v_total_elapsed,
        'server_time', v_server_time
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;-- Migration: function_update_updated_at_column
-- Trigger function: Auto-update updated_at column

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;