-- Create or replace the finalize_draft RPC function (revised)
-- Computes total duration excluding pause segments (net billable running time)
-- Snapshots ALL segments (incl pauses) for history
-- Duration unit: seconds (integer); EXTRACT(epoch FROM interval)

CREATE OR REPLACE FUNCTION finalize_draft(
  p_user_id uuid,
  p_draft_id uuid,
  p_task_name text,
  p_comment text
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
  SET end_time = now(), is_running = false
  WHERE session_id = v_session.id
    AND is_running = true
    AND end_time IS NULL;

  -- Step 2: Compute total duration in seconds from RUNNING segments only (exclude pauses)
  -- Uses COALESCE(end_time, now()) for any still-running (should be none after step 1)
  SELECT COALESCE(
    SUM(EXTRACT(epoch FROM (COALESCE(ts.end_time, now()) - ts.start_time))),
    0
  ) INTO v_total_duration
  FROM timer_segment ts
  WHERE ts.session_id = v_session.id AND NOT ts.is_pause;

  -- Step 3: Snapshot ALL segments as JSON array (including pauses, ordered by start_time)
  SELECT json_agg(row_to_json(ts) ORDER BY ts.start_time ASC) INTO v_segments
  FROM timer_segment ts
  WHERE ts.session_id = v_session.id;

  -- Step 4: Update timer_session (elapsed_time as int seconds)
  UPDATE timer_session
  SET
    timer_segments = v_segments,
    elapsed_time = v_total_duration::integer,
    is_running = false,
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
    timer_sessions = to_jsonb(v_updated_session)
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