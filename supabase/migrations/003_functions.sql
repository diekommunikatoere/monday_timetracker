-- Migration: 003_functions.sql
-- All core RPC functions for the timetracker backend

-- ============================================
-- User & Time Entry Queries
-- ============================================

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
    AND te.deleted_at IS NULL
    ORDER BY te.start_time DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Timer Session Management
-- ============================================

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
        AND te.deleted_at IS NULL
    )
    ORDER BY ts.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_timer_session_with_elapsed(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_session timer_session;
    v_time_entry time_entry;
    v_current_segment_duration BIGINT;
    v_total_elapsed BIGINT;
    v_server_time TIMESTAMPTZ;
BEGIN
    v_server_time := NOW();

    SELECT * INTO v_session
    FROM timer_session
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'session', NULL,
            'server_time', v_server_time
        );
    END IF;

    SELECT * INTO v_time_entry
    FROM time_entry
    WHERE id = v_session.draft_id;

    v_total_elapsed := v_session.elapsed_time;

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
$$;

CREATE OR REPLACE FUNCTION get_current_elapsed_time(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_session timer_session;
    v_current_segment_duration BIGINT;
    v_total_elapsed BIGINT;
    v_server_time TIMESTAMPTZ;
BEGIN
    v_server_time := NOW();

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

    v_total_elapsed := v_session.elapsed_time;

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

        v_total_elapsed := v_total_elapsed + COALESCE(v_current_segment_duration, 0);
    END IF;

    RETURN jsonb_build_object(
        'elapsed_time_ms', v_total_elapsed,
        'server_time', v_server_time,
        'is_paused', v_session.is_paused,
        'stored_elapsed_time_ms', v_session.elapsed_time
    );
END;
$$;

-- ============================================
-- Finalization Logic
-- ============================================

CREATE OR REPLACE FUNCTION finalize_segment(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_duration_ms BIGINT;
  v_elapsed_ms INTEGER;
BEGIN
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

  UPDATE timer_session
  SET elapsed_time = elapsed_time + v_duration_ms::INTEGER
  WHERE id = p_session_id
  RETURNING elapsed_time INTO v_elapsed_ms;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timer session not found: %', p_session_id;
  END IF;

  UPDATE timer_session
  SET is_paused = true
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'elapsed_time_ms', v_elapsed_ms,
    'duration_added_ms', v_duration_ms
  );
END;
$$;

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
  IF NOT EXISTS (
    SELECT 1 FROM time_entry
    WHERE id = p_draft_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Draft not found or access denied for user %', p_user_id;
  END IF;

  SELECT ts.* INTO v_session
  FROM timer_session ts
  WHERE ts.draft_id = p_draft_id;

  v_has_session := FOUND;

  IF v_has_session THEN
    UPDATE timer_segment
    SET end_time = now()
    WHERE session_id = v_session.id
      AND end_time IS NULL;

    SELECT COALESCE(
      SUM(EXTRACT(epoch FROM (COALESCE(ts.end_time, now()) - ts.start_time))),
      0
    ) INTO v_total_duration
    FROM timer_segment ts
    WHERE ts.session_id = v_session.id;

    SELECT json_agg(row_to_json(ts) ORDER BY ts.start_time ASC) INTO v_segments
    FROM timer_segment ts
    WHERE ts.session_id = v_session.id;

    UPDATE timer_session
    SET
      timer_segments = v_segments,
      elapsed_time = COALESCE(p_duration, v_total_duration::integer),
      is_paused = false
    WHERE id = v_session.id
    RETURNING * INTO v_updated_session;
  END IF;

  IF p_duration IS NOT NULL THEN
    v_total_duration := p_duration;
  ELSIF NOT v_has_session THEN
    RAISE EXCEPTION 'Duration must be provided when finalizing a draft without a session';
  END IF;

  v_end_time := COALESCE(p_date, now());

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
      ELSE timer_session
    END
  WHERE id = p_draft_id
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

CREATE OR REPLACE FUNCTION finalize_draft(p_user_id uuid, p_draft_id uuid, p_task_name text, p_comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_session timer_session;
  v_total_duration numeric;
  v_segments jsonb;
  v_updated_session timer_session;
  v_updated_entry time_entry;
BEGIN
  SELECT ts.* INTO v_session
  FROM timer_session ts
  JOIN time_entry te ON ts.draft_id = te.id
  WHERE te.id = p_draft_id AND te.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft not found or access denied for user %', p_user_id;
  END IF;

  UPDATE timer_segment
  SET end_time = now()
  WHERE session_id = v_session.id
    AND end_time IS NULL;

  SELECT COALESCE(
    SUM(EXTRACT(epoch FROM (COALESCE(ts.end_time, now()) - ts.start_time))),
    0
  ) INTO v_total_duration
  FROM timer_segment ts
  WHERE ts.session_id = v_session.id;

  SELECT json_agg(row_to_json(ts) ORDER BY ts.start_time ASC) INTO v_segments
  FROM timer_segment ts
  WHERE ts.session_id = v_session.id;

  UPDATE timer_session
  SET
    timer_segments = v_segments,
    elapsed_time = v_total_duration::integer,
    is_paused = false
  WHERE id = v_session.id
  RETURNING * INTO v_updated_session;

  UPDATE time_entry
  SET
    task_name = p_task_name,
    end_time = now(),
    duration = v_total_duration::integer,
    comment = p_comment,
    timer_session = to_jsonb(v_updated_session)
  WHERE id = p_draft_id
  RETURNING * INTO v_updated_entry;

  RETURN jsonb_build_object(
    'time_entry', row_to_json(v_updated_entry),
    'timer_session', row_to_json(v_updated_session),
    'total_duration_seconds', v_total_duration::integer
  );
END;
$$;

-- ============================================
-- Utility & Seeding
-- ============================================

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
    IF NOT EXISTS (
        SELECT 1 FROM time_entry
        WHERE id = p_old_draft_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Draft not found or access denied';
    END IF;

    INSERT INTO time_entry (user_id, is_draft)
    VALUES (p_user_id, true)
    RETURNING id INTO v_new_draft_id;

    INSERT INTO timer_session (user_id, draft_id, elapsed_time, is_paused)
    VALUES (p_user_id, v_new_draft_id, 0, false)
    RETURNING id INTO v_new_session_id;

    RETURN jsonb_build_object(
        'draft_id', v_new_draft_id,
        'session_id', v_new_session_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION add_default_roles()
 RETURNS void
 LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.role (name, description, hourly_rate)
    VALUES
        ('Geschäftsführung', 'Leitung und strategische Entscheidungen', 150),
        ('Projektleitung', 'Projektmanagement und Teamführung', 110),
        ('Assistenz', 'Unterstützung der Geschäftsführung und Teams', 70),
        ('Graphik', 'Graphikdesign und Multimedia', 95),
        ('Webentwicklung', 'Webentwicklung und Programmierung', 105),
        ('Medical Writing', 'Medizinische Fachtexte und Dokumentation', 115),
        ('Copy Writing', 'Texterstellung und Content Marketing', 105),
        ('Social Media', 'Social Media Management und Marketing', 0),
        ('SEO/SEA/GEO', 'Suchmaschinenoptimierung, Suchmaschinenwerbung und KI-Optimierung', 0),
        ('Meeting', 'Meetings und Calls', 0),
        ('Intern oder Akquise', 'Interne Aufgaben, Akquise oder Weiterbildung', 0)
    ON CONFLICT (name) DO UPDATE SET
        hourly_rate = EXCLUDED.hourly_rate;
END;
$$;

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
      AND te.deleted_at IS NULL
      AND (p_user_id IS NULL OR te.user_id = p_user_id)
      AND te.role_id IS NOT NULL
    GROUP BY te.role_id, r.name
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
