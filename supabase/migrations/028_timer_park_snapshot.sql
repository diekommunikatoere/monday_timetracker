-- Migration: 028_timer_park_snapshot.sql
-- Wave 1 (live-safe, additive) — see plan "Timer park — snapshot duration/end_time/start_time".
--
-- Problem: timer_park (025) only closes the open segment and sets timer_state/comment — it
-- leaves duration, end_time, start_time unset. Reopening a parked draft in SaveTimerModal reads
-- those columns directly (TimeEntriesTable.tsx), so NULLs produce "NaN:NaN" in the form.
--
-- Fix: timer_park now snapshots a coherent window at park time, reusing timer_finalize's
-- segment-sum + 1-59s->60s rounding convention: end_time = now(), start_time = end - duration.
--
-- Since a parked entry can never be resumed in the current UI (pickActiveTimer never selects
-- parked; the widget's resume only fires from 'paused'; the draft row menu offers only
-- save/delete), we also tighten timer_resume to reject parked entries instead of clearing the
-- snapshot on resume.
--
-- This migration is additive/Wave-1-safe: CREATE OR REPLACE of two existing functions (same
-- signatures/return types/SECURITY DEFINER as 025) plus a guarded, idempotent backfill UPDATE.

-- ============================================
-- timer_park — snapshot duration/start_time/end_time on park
-- ============================================
CREATE OR REPLACE FUNCTION public.timer_park(
    p_user_id  uuid,
    p_entry_id uuid,
    p_comment  text DEFAULT NULL
) RETURNS public.time_entry AS $$
DECLARE
    v_entry     public.time_entry;
    v_seg_total integer;
    v_duration  integer;
    v_end       timestamptz;
BEGIN
    -- Close any open segment; elapsed time is preserved in the closed segments.
    UPDATE public.timer_segment SET end_time = now()
     WHERE entry_id = p_entry_id AND end_time IS NULL;

    -- Total tracked time from segments (seconds); all segments are now closed.
    SELECT COALESCE(SUM(EXTRACT(epoch FROM (COALESCE(seg.end_time, now()) - seg.start_time))), 0)::integer
      INTO v_seg_total
      FROM public.timer_segment seg
     WHERE seg.entry_id = p_entry_id;

    v_duration := v_seg_total;
    IF v_duration > 0 AND v_duration < 60 THEN
        v_duration := 60; -- 1-59s -> 60 (matches timer_finalize)
    END IF;
    v_end := now();

    UPDATE public.time_entry
       SET timer_state = 'parked',
           duration    = v_duration,
           end_time    = v_end,
           start_time  = v_end - (v_duration || ' seconds')::interval,
           comment     = COALESCE(p_comment, comment),
           updated_at  = now()
     WHERE id = p_entry_id AND user_id = p_user_id
       AND timer_state IN ('running', 'paused', 'parked')
    RETURNING * INTO v_entry;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timer not found, not owned, or not parkable: %', p_entry_id;
    END IF;

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- timer_resume — continue a paused timer (parked entries are no longer resumable)
-- ============================================
-- A parked entry cannot be reached from any current UI path (see comment above), so resuming
-- it is now rejected rather than clearing its just-written snapshot.
CREATE OR REPLACE FUNCTION public.timer_resume(
    p_user_id  uuid,
    p_entry_id uuid
) RETURNS public.time_entry AS $$
DECLARE
    v_entry public.time_entry;
BEGIN
    UPDATE public.timer_segment seg SET end_time = now()
      FROM public.time_entry te
     WHERE seg.entry_id = te.id
       AND te.user_id = p_user_id
       AND te.timer_state = 'running'
       AND te.id <> p_entry_id
       AND seg.end_time IS NULL;

    UPDATE public.time_entry
       SET timer_state = 'paused', updated_at = now()
     WHERE user_id = p_user_id AND timer_state = 'running' AND id <> p_entry_id;

    UPDATE public.time_entry
       SET timer_state = 'running', updated_at = now()
     WHERE id = p_entry_id AND user_id = p_user_id
       AND timer_state = 'paused'
    RETURNING * INTO v_entry;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timer not found, not owned, or not resumable: %', p_entry_id;
    END IF;

    -- Open a fresh running segment.
    INSERT INTO public.timer_segment (entry_id) VALUES (v_entry.id);

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Backfill: snapshot pre-existing parked drafts that predate this migration
-- ============================================
-- Guarded on duration IS NULL so this is idempotent and only touches un-snapshotted rows.
WITH seg AS (
    SELECT entry_id,
           COALESCE(SUM(EXTRACT(epoch FROM (COALESCE(end_time, now()) - start_time))), 0)::integer AS total
      FROM public.timer_segment
     GROUP BY entry_id
)
UPDATE public.time_entry te
   SET duration   = CASE WHEN COALESCE(seg.total, 0) BETWEEN 1 AND 59 THEN 60 ELSE COALESCE(seg.total, 0) END,
       end_time   = now(),
       start_time = now() - (CASE WHEN COALESCE(seg.total, 0) BETWEEN 1 AND 59 THEN 60 ELSE COALESCE(seg.total, 0) END || ' seconds')::interval,
       updated_at = now()
  FROM seg
 WHERE te.id = seg.entry_id
   AND te.timer_state = 'parked'
   AND te.duration IS NULL;
