-- Migration: 032_timer_finalize_keep_draft.sql
-- Adds an opt-in "keep as draft" mode to timer_finalize so a running/paused
-- timer (or a reopened parked draft) can be saved with an explicit time
-- window and an optional role, without promoting it to 'finalized' and
-- without requiring a board/item/role assignment.
--
-- Behavior is identical to the 029 version except the final promote step:
-- when p_keep_draft is true, timer_state stays/becomes 'parked' instead of
-- 'finalized'. Board/item bootstrap and role assignment are unconditional
-- (and already null-safe) so a draft may carry a role, a board+item, both,
-- or neither.
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
    p_end_time         timestamptz DEFAULT NULL,
    p_keep_draft       boolean     DEFAULT false
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

    -- 4. Promote to a durable record — 'finalized' normally, or stay 'parked'
    --    when the caller explicitly asked to keep it as a draft.
    UPDATE public.time_entry
       SET start_time  = v_start_time,
           end_time    = v_end_time,
           duration    = v_total_duration::integer,
           comment     = p_comment,
           board_id    = p_board_id,
           item_id     = p_item_id,
           role_id     = p_role_id,
           timer_state = CASE WHEN p_keep_draft THEN 'parked'::public.timer_state ELSE 'finalized'::public.timer_state END,
           updated_at  = now()
     WHERE id = p_entry_id AND user_id = p_user_id
    RETURNING * INTO v_entry;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timer not found or not owned: %', p_entry_id;
    END IF;

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
