-- Migration: 003_functions.sql
-- Description: Consolidated RPC functions for the timetracker backend.
-- This file contains the latest versions of all used functions, removing unused orphans.

-- ============================================
-- 1. User & Time Entry Queries
-- ============================================

-- get_user_time_entries: Returns time entries for a user with joined metadata
CREATE OR REPLACE FUNCTION public.get_user_time_entries(
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
        COALESCE(mi.name, 'Unbenannter Zeiteintrag') as task_name,
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
        te.timer_session,
        te.created_at,
        te.updated_at
    FROM public.time_entry te
    LEFT JOIN public.monday_board mb ON te.board_id = mb.id
    LEFT JOIN public.monday_item mi ON te.item_id = mi.id
    LEFT JOIN public.monday_item mpi ON te.parent_item_id = mpi.id
    LEFT JOIN public.role r ON te.role_id = r.id
    WHERE te.user_id = p_user_id
    AND te.deleted_at IS NULL
    ORDER BY te.start_time DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. Timer Session Management
-- ============================================

-- get_timer_session_with_elapsed: Returns current session details with server-calculated elapsed time
CREATE OR REPLACE FUNCTION public.get_timer_session_with_elapsed(p_user_id UUID)
RETURNS jsonb AS $$
DECLARE
    v_session public.timer_session;
    v_time_entry public.time_entry;
    v_current_segment_duration BIGINT;
    v_total_elapsed BIGINT;
    v_server_time TIMESTAMPTZ;
BEGIN
    v_server_time := NOW();

    SELECT * INTO v_session
    FROM public.timer_session
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'session', NULL,
            'server_time', v_server_time
        );
    END IF;

    SELECT * INTO v_time_entry
    FROM public.time_entry
    WHERE id = v_session.draft_id;

    v_total_elapsed := v_session.elapsed_time;

    IF NOT v_session.is_paused THEN
        SELECT COALESCE(
            EXTRACT(EPOCH FROM (v_server_time - seg.start_time)) * 1000,
            0
        )::BIGINT INTO v_current_segment_duration
        FROM public.timer_segment seg
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_current_elapsed_time: Returns the current calculated elapsed time for a specific session
CREATE OR REPLACE FUNCTION public.get_current_elapsed_time(p_session_id UUID)
RETURNS jsonb AS $$
DECLARE
    v_session public.timer_session;
    v_current_segment_duration BIGINT;
    v_total_elapsed BIGINT;
    v_server_time TIMESTAMPTZ;
BEGIN
    v_server_time := NOW();

    SELECT * INTO v_session
    FROM public.timer_session
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
        FROM public.timer_segment seg
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- finalize_segment: Closes open segments and updates session elapsed time
CREATE OR REPLACE FUNCTION public.finalize_segment(p_session_id UUID)
RETURNS jsonb AS $$
DECLARE
  v_duration_ms BIGINT;
  v_elapsed_ms INTEGER;
BEGIN
  WITH closed_segments AS (
    UPDATE public.timer_segment
    SET
      end_time = now(),
      duration = EXTRACT(EPOCH FROM (now() - start_time)) * 1000::BIGINT
    WHERE session_id = p_session_id AND end_time IS NULL
    RETURNING EXTRACT(EPOCH FROM (now() - start_time)) * 1000::BIGINT AS seg_duration_ms
  )
  SELECT COALESCE(SUM(seg_duration_ms), 0) INTO v_duration_ms
  FROM closed_segments;

  UPDATE public.timer_session
  SET elapsed_time = elapsed_time + v_duration_ms::INTEGER,
      is_paused = true
  WHERE id = p_session_id
  RETURNING elapsed_time INTO v_elapsed_ms;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timer session not found: %', p_session_id;
  END IF;

  RETURN jsonb_build_object(
    'elapsed_time_ms', v_elapsed_ms,
    'duration_added_ms', v_duration_ms
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Finalization Logic
-- ============================================

-- finalize_time_entry: Main function to finalize a draft, update dimension tables, and close sessions
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
    p_date TIMESTAMPTZ DEFAULT NULL
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

  -- 4. Update time entry
  UPDATE public.time_entry
  SET
    start_time = v_start_time,
    end_time = v_end_time,
    duration = v_total_duration::integer,
    comment = p_comment,
    board_id = p_board_id,
    item_id = p_item_id,
    role_id = p_role_id,
    parent_item_id = p_parent_item_id,
    is_draft = false,
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

-- finalize_draft: Compatibility wrapper for finalize_time_entry
CREATE OR REPLACE FUNCTION public.finalize_draft(p_user_id UUID, p_draft_id UUID, p_task_name TEXT, p_comment TEXT)
RETURNS jsonb AS $$
BEGIN
    RETURN public.finalize_time_entry(
        p_user_id := p_user_id,
        p_draft_id := p_draft_id,
        p_task_name := p_task_name,
        p_comment := p_comment
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Budget & Aggregation Functions
-- ============================================

-- get_effective_hourly_rate: Returns the effective hourly rate for a role on a board
CREATE OR REPLACE FUNCTION public.get_effective_hourly_rate(
    p_board_id TEXT,
    p_role_id UUID
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_override_rate DECIMAL(10,2);
    v_global_rate DECIMAL(10,2);
BEGIN
    SELECT hourly_rate INTO v_override_rate
    FROM public.board_role_override
    WHERE board_id = p_board_id 
      AND role_id = p_role_id
      AND is_enabled = TRUE;
    
    IF v_override_rate IS NOT NULL THEN
        RETURN v_override_rate;
    END IF;
    
    SELECT hourly_rate INTO v_global_rate
    FROM public.role
    WHERE id = p_role_id
      AND is_active = TRUE;
    
    RETURN COALESCE(v_global_rate, 0.00);
END;
$$ LANGUAGE plpgsql STABLE;

-- get_item_total_time: Returns total tracked time in seconds for multiple items and their sub-items
CREATE OR REPLACE FUNCTION public.get_item_total_time(
    p_item_ids TEXT[],
    p_user_id UUID DEFAULT NULL
)
RETURNS BIGINT AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(duration)
         FROM public.time_entry
         WHERE (item_id = ANY(p_item_ids) OR parent_item_id = ANY(p_item_ids))
           AND is_draft = false
           AND deleted_at IS NULL
           AND (p_user_id IS NULL OR user_id = p_user_id)),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_item_time_by_role: Returns total tracked time grouped by role for multiple items
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
    WHERE (te.item_id = ANY(p_item_ids) OR te.parent_item_id = ANY(p_item_ids))
      AND te.is_draft = false
      AND te.deleted_at IS NULL
      AND (p_user_id IS NULL OR te.user_id = p_user_id)
      AND te.role_id IS NOT NULL
    GROUP BY te.role_id, r.name
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- calculate_remaining_budget: Calculates budget metrics for multiple items
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
    WHERE (te.item_id = ANY(p_item_ids) OR te.parent_item_id = ANY(p_item_ids))
      AND te.is_draft = false
      AND te.deleted_at IS NULL
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
-- 5. Utility & Seeding
-- ============================================

-- soft_reset_timer: Resets a timer by creating a new draft and session
CREATE OR REPLACE FUNCTION public.soft_reset_timer(
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
        SELECT 1 FROM public.time_entry
        WHERE id = p_old_draft_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Draft not found or access denied';
    END IF;

    INSERT INTO public.time_entry (user_id, is_draft)
    VALUES (p_user_id, true)
    RETURNING id INTO v_new_draft_id;

    INSERT INTO public.timer_session (user_id, draft_id, elapsed_time, is_paused)
    VALUES (p_user_id, v_new_draft_id, 0, false)
    RETURNING id INTO v_new_session_id;

    RETURN jsonb_build_object(
        'draft_id', v_new_draft_id,
        'session_id', v_new_session_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- add_default_roles: Seeds the database with default roles
CREATE OR REPLACE FUNCTION public.add_default_roles()
RETURNS void AS $$
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
$$ LANGUAGE plpgsql;
