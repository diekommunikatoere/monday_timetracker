-- Migration 007: Optimize timer_segment schema
-- Adds duration column (ms), drops unused flags (is_running, is_pause)
-- Adds composite index on (session_id, end_time NULLS FIRST)
-- Creates atomic RPC finalize_segment(session_id) to close open segment(s),
-- compute/add durations to session.elapsed_time, return new elapsed_time_ms

-- 1. Add duration column (nullable bigint, ms)
ALTER TABLE timer_segment
ADD COLUMN duration BIGINT;

-- 2. Backfill durations for existing finalized segments
UPDATE timer_segment
SET duration = EXTRACT(EPOCH FROM (end_time - start_time)) * 1000::BIGINT
WHERE end_time IS NOT NULL;

-- 3. Drop unused boolean flags
ALTER TABLE timer_segment
DROP COLUMN IF EXISTS is_running;

ALTER TABLE timer_segment
DROP COLUMN IF EXISTS is_pause;

-- 4. Add composite index for efficient session segment queries (open segments first)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_timer_segment_session_end
ON timer_segment (session_id, end_time NULLS FIRST);

-- 5. Atomic RPC: finalize_segment(session_id UUID)
--    - Closes any open segments (end_time NULL -> now(), duration computed)
--    - Adds total new duration to session.elapsed_time
--    - Returns { elapsed_time_ms: integer }
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

  RETURN jsonb_build_object(
    'elapsed_time_ms', v_elapsed_ms,
    'duration_added_ms', v_duration_ms
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;