-- Migration: 022_finalize_honor_explicit_times.sql
-- Description: Make finalize_time_entry honor explicit start/end times when the client
--   provides them. Previously the RPC always recomputed start_time from p_date and
--   end_time from p_duration, discarding the exact start/end the user saw and edited in
--   the Save modal (the finalize route wrote them to the draft, then this RPC overwrote
--   them). Now, when p_start_time and p_end_time are supplied, they are persisted as-is.
--   The duration-based fallback (used by the finalize_draft wrapper / timer-only path)
--   is unchanged.
--
--   We add two parameters, so the function signature changes -- drop the old overload
--   first (plain DROP, not CASCADE: the finalize_draft wrapper resolves at call time and
--   is unaffected), then recreate.

DROP FUNCTION IF EXISTS public.finalize_time_entry(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN
);

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
    p_is_draft BOOLEAN DEFAULT false,
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL
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
  IF p_start_time IS NOT NULL AND p_end_time IS NOT NULL THEN
    -- Honor the exact times the user saw/edited in the modal
    v_start_time := p_start_time;
    v_end_time   := p_end_time;
    -- Defensive: never persist an inverted span. The client already builds a
    -- non-inverted end, but if anything slips through, rebuild the end from the
    -- positive duration rather than storing end < start.
    IF v_end_time <= v_start_time AND p_duration IS NOT NULL THEN
      v_end_time := v_start_time + (p_duration || ' seconds')::interval;
    END IF;
    v_total_duration := extract(epoch from (v_end_time - v_start_time))::integer;
    IF v_total_duration > 0 AND v_total_duration < 60 THEN
      v_total_duration := 60;
    END IF;
  ELSE
    -- Fallback (timer-only path / finalize_draft wrapper): derive from date + duration
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
  END IF;

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
