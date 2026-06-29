-- Migration: 025_timer_functions.sql
-- Wave 1 (live-safe, additive) of the timer 2-table redesign — see docs/timer-redesign.md §4.
--
-- Creates the new atomic timer RPCs for the 2-table model. Each transition is a single
-- SECURITY DEFINER function (one transaction, ownership-enforced), so an interruption can
-- no longer orphan rows the way the old multi-call paths did (the reported bug).
--
-- These are NEW functions; nothing existing is dropped or replaced here, so the currently
-- deployed app (which still calls the legacy timer functions) keeps working unchanged.
-- They operate on the columns added in 023: time_entry.timer_state and timer_segment.entry_id
-- (segments reference the entry directly — no timer_session).
--
-- Transitional invariant: while time_entry.is_draft still exists (until 027), these functions
-- keep it consistent so the legacy is_draft-filtered read/aggregate functions stay correct.
-- running/paused/parked entries keep is_draft = TRUE (the column default); timer_finalize sets
-- is_draft = FALSE explicitly. is_draft and these writes are removed in 027.

-- ============================================
-- timer_start — begin a new running timer
-- ============================================
-- One running timer per user: any currently running timer is PAUSED (preserved, not
-- discarded). The client confirms this via the O2 dialog before calling.
-- p_item_id/p_board_id, when supplied, come from a context that has already mirrored the
-- item (e.g. the item sidebar), so the time_entry FK to monday_item/monday_board is satisfied.
CREATE OR REPLACE FUNCTION public.timer_start(
    p_user_id  uuid,
    p_board_id text DEFAULT NULL,
    p_item_id  text DEFAULT NULL,
    p_role_id  uuid DEFAULT NULL
) RETURNS public.time_entry AS $$
DECLARE
    v_entry public.time_entry;
BEGIN
    -- Demote the current running timer: close its open segment, set it paused.
    UPDATE public.timer_segment seg SET end_time = now()
      FROM public.time_entry te
     WHERE seg.entry_id = te.id
       AND te.user_id = p_user_id
       AND te.timer_state = 'running'
       AND seg.end_time IS NULL;

    UPDATE public.time_entry
       SET timer_state = 'paused', updated_at = now()
     WHERE user_id = p_user_id AND timer_state = 'running';

    -- New running timer. is_draft defaults TRUE (transitional; dropped in 027).
    INSERT INTO public.time_entry (user_id, timer_state, board_id, item_id, role_id)
    VALUES (p_user_id, 'running', p_board_id, p_item_id, p_role_id)
    RETURNING * INTO v_entry;

    -- Open the first segment (end_time NULL = running). session_id stays NULL.
    INSERT INTO public.timer_segment (entry_id) VALUES (v_entry.id);

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- timer_pause — hold a running timer
-- ============================================
CREATE OR REPLACE FUNCTION public.timer_pause(
    p_user_id  uuid,
    p_entry_id uuid
) RETURNS public.time_entry AS $$
DECLARE
    v_entry public.time_entry;
BEGIN
    -- Close the open segment; the gap until resume is the pause.
    UPDATE public.timer_segment SET end_time = now()
     WHERE entry_id = p_entry_id AND end_time IS NULL;

    UPDATE public.time_entry
       SET timer_state = 'paused', updated_at = now()
     WHERE id = p_entry_id AND user_id = p_user_id AND timer_state = 'running'
    RETURNING * INTO v_entry;

    IF NOT FOUND THEN
        -- Idempotent: already paused (or parked) and owned -> return unchanged.
        SELECT * INTO v_entry FROM public.time_entry
         WHERE id = p_entry_id AND user_id = p_user_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Timer not found or not owned: %', p_entry_id;
        END IF;
    END IF;

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- timer_resume — continue a paused/parked timer
-- ============================================
-- Enforces one running per user: any other running timer is paused first.
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
       AND timer_state IN ('paused', 'parked')
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
-- timer_park — "save as draft" (set aside to finalize/edit later)
-- ============================================
CREATE OR REPLACE FUNCTION public.timer_park(
    p_user_id  uuid,
    p_entry_id uuid,
    p_comment  text DEFAULT NULL
) RETURNS public.time_entry AS $$
DECLARE
    v_entry public.time_entry;
BEGIN
    -- Close any open segment; elapsed time is preserved in the closed segments.
    UPDATE public.timer_segment SET end_time = now()
     WHERE entry_id = p_entry_id AND end_time IS NULL;

    UPDATE public.time_entry
       SET timer_state = 'parked',
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
-- timer_finalize — promote a timer to a durable, finalized entry
-- ============================================
-- Ported from finalize_time_entry (mig 022): honors explicit start/end times when supplied,
-- applies the 1-59s -> 60s rounding. Duration is summed from segments (by entry_id) instead of
-- a timer_session. There is no session to delete.
--
-- Dimension rows: time_entry.board_id/item_id are FKs into monday_board/monday_item, so the
-- target rows must exist before we set them. We BOOTSTRAP a missing row with the client-supplied
-- name (ON CONFLICT DO NOTHING) — we do NOT overwrite an existing one, so a webhook-maintained
-- name is never clobbered. (Name self-healing still happens via getBoardTasks' batch upsert on
-- board load.) p_task_name is accepted for call-site parity but unused (name derives from monday_item).
CREATE OR REPLACE FUNCTION public.timer_finalize(
    p_user_id          uuid,
    p_entry_id         uuid,
    p_task_name        text        DEFAULT NULL,
    p_comment          text        DEFAULT NULL,
    p_board_id         text        DEFAULT NULL,
    p_item_id          text        DEFAULT NULL,
    p_role_id          uuid        DEFAULT NULL,
    p_board_name       text        DEFAULT NULL,
    p_item_name        text        DEFAULT NULL,
    p_parent_item_id   text        DEFAULT NULL,
    p_parent_item_name text        DEFAULT NULL,
    p_duration         integer     DEFAULT NULL,
    p_start_time       timestamptz DEFAULT NULL,
    p_end_time         timestamptz DEFAULT NULL
) RETURNS public.time_entry AS $$
DECLARE
    v_entry          public.time_entry;
    v_seg_total      numeric;
    v_start_time     timestamptz;
    v_end_time       timestamptz;
    v_total_duration numeric;
BEGIN
    -- 1. Bootstrap missing monday dimension rows so the time_entry FKs resolve.
    --    DO NOTHING: never overwrite an existing (webhook-maintained) name.
    IF p_board_id IS NOT NULL AND p_board_name IS NOT NULL THEN
        INSERT INTO public.monday_board (id, name)
        VALUES (p_board_id, p_board_name)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    IF p_item_id IS NOT NULL AND p_item_name IS NOT NULL THEN
        INSERT INTO public.monday_item (id, name, board_id, parent_item_id)
        VALUES (p_item_id, p_item_name, p_board_id, p_parent_item_id)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    IF p_parent_item_id IS NOT NULL AND p_parent_item_name IS NOT NULL THEN
        INSERT INTO public.monday_item (id, name, board_id)
        VALUES (p_parent_item_id, p_parent_item_name, p_board_id)
        ON CONFLICT (id) DO NOTHING;
    END IF;

    -- 2. Close the open segment and total tracked time from segments (seconds).
    UPDATE public.timer_segment SET end_time = now()
     WHERE entry_id = p_entry_id AND end_time IS NULL;

    SELECT COALESCE(SUM(EXTRACT(epoch FROM (COALESCE(seg.end_time, now()) - seg.start_time))), 0)
      INTO v_seg_total
      FROM public.timer_segment seg
     WHERE seg.entry_id = p_entry_id;

    -- 3. Resolve start/end/duration (ported from mig 022).
    IF p_start_time IS NOT NULL AND p_end_time IS NOT NULL THEN
        -- Honor the exact times the user saw/edited in the Save modal.
        v_start_time := p_start_time;
        v_end_time   := p_end_time;
        -- Defensive: never persist an inverted span.
        IF v_end_time <= v_start_time AND p_duration IS NOT NULL THEN
            v_end_time := v_start_time + (p_duration || ' seconds')::interval;
        END IF;
        v_total_duration := extract(epoch from (v_end_time - v_start_time))::integer;
    ELSE
        -- Timer-only path: keep the entry's start, derive duration from override or segments.
        SELECT start_time INTO v_start_time FROM public.time_entry WHERE id = p_entry_id;
        v_total_duration := COALESCE(p_duration, v_seg_total)::integer;
        v_end_time := v_start_time + (v_total_duration || ' seconds')::interval;
    END IF;

    -- 1-59 seconds rounds up to a full minute (matches mig 022).
    IF v_total_duration > 0 AND v_total_duration < 60 THEN
        v_total_duration := 60;
        v_end_time := v_start_time + (v_total_duration || ' seconds')::interval;
    END IF;

    -- 4. Promote to a durable, finalized record.
    UPDATE public.time_entry
       SET start_time  = v_start_time,
           end_time    = v_end_time,
           duration    = v_total_duration::integer,
           comment     = p_comment,
           board_id    = p_board_id,
           item_id     = p_item_id,
           role_id     = p_role_id,
           timer_state = 'finalized',
           is_draft    = false,   -- transitional: is_draft is dropped in 027
           updated_at  = now()
     WHERE id = p_entry_id AND user_id = p_user_id
    RETURNING * INTO v_entry;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timer not found or not owned: %', p_entry_id;
    END IF;

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- timer_reset — discard a non-finalized timer
-- ============================================
-- Deletes the entry; segments cascade via timer_segment.entry_id ON DELETE CASCADE (mig 023).
-- Guarded so a finalized entry can never be deleted through this path.
CREATE OR REPLACE FUNCTION public.timer_reset(
    p_user_id  uuid,
    p_entry_id uuid
) RETURNS void AS $$
DECLARE
    v_deleted int;
BEGIN
    DELETE FROM public.time_entry
     WHERE id = p_entry_id AND user_id = p_user_id
       AND timer_state IN ('running', 'paused', 'parked');
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted = 0 THEN
        RAISE EXCEPTION 'Timer not found, not owned, or already finalized: %', p_entry_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- get_active_timers — the tray of non-finalized timers with live elapsed time
-- ============================================
-- Replaces get_timer_session_with_elapsed + GET /session. elapsed_seconds sums segment
-- durations (open segment counted up to now()); the client ticks the live second locally.
CREATE OR REPLACE FUNCTION public.get_active_timers(p_user_id uuid)
RETURNS TABLE (
    id              uuid,
    user_id         uuid,
    timer_state     public.timer_state,
    board_id        text,
    item_id         text,
    role_id         uuid,
    comment         text,
    start_time      timestamptz,
    created_at      timestamptz,
    updated_at      timestamptz,
    elapsed_seconds integer
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.id,
        te.user_id,
        te.timer_state,
        te.board_id,
        te.item_id,
        te.role_id,
        te.comment,
        te.start_time,
        te.created_at,
        te.updated_at,
        COALESCE((
            SELECT SUM(EXTRACT(epoch FROM (COALESCE(seg.end_time, now()) - seg.start_time)))
            FROM public.timer_segment seg
            WHERE seg.entry_id = te.id
        ), 0)::integer AS elapsed_seconds
    FROM public.time_entry te
    WHERE te.user_id = p_user_id
      AND te.timer_state IN ('running', 'paused', 'parked')
      AND te.deleted_at IS NULL
    ORDER BY te.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
