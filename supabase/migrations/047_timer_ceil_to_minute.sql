-- Migration: 047_timer_ceil_to_minute.sql
-- Description: Round timer durations up to whole minutes (`0 -> 0`, `s > 0 -> CEIL(s / 60.0) * 60`)
-- in both `timer_park` and `timer_finalize` so parked drafts, SaveTimerModal, and headless
-- finalize calls all agree on minute-ceiled durations. Preserves audit stamping (`updated_by`)
-- and EXECUTE lockdown from migrations 036 / 043.

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
    UPDATE public.timer_segment SET end_time = now()
     WHERE entry_id = p_entry_id AND end_time IS NULL;

    SELECT FLOOR(COALESCE(SUM(EXTRACT(epoch FROM (COALESCE(seg.end_time, now()) - seg.start_time))), 0))::integer
      INTO v_seg_total
      FROM public.timer_segment seg
     WHERE seg.entry_id = p_entry_id;

    v_duration := v_seg_total;
    IF v_duration > 0 THEN
        v_duration := CEIL(v_duration / 60.0)::integer * 60;
    END IF;
    v_end := now();

    UPDATE public.time_entry
       SET timer_state = 'parked',
           duration    = v_duration,
           end_time    = v_end,
           start_time  = v_end - (v_duration || ' seconds')::interval,
           comment     = COALESCE(p_comment, comment),
           updated_at  = now(),
           updated_by  = p_user_id
     WHERE id = p_entry_id AND user_id = p_user_id
       AND timer_state IN ('running', 'paused', 'parked')
    RETURNING * INTO v_entry;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timer not found, not owned, or not parkable: %', p_entry_id;
    END IF;

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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

    UPDATE public.timer_segment SET end_time = now()
     WHERE entry_id = p_entry_id AND end_time IS NULL;

    SELECT COALESCE(SUM(EXTRACT(epoch FROM (COALESCE(seg.end_time, now()) - seg.start_time))), 0)
      INTO v_seg_total
      FROM public.timer_segment seg
     WHERE seg.entry_id = p_entry_id;

    IF p_start_time IS NOT NULL AND p_end_time IS NOT NULL THEN
        v_start_time := p_start_time;
        v_end_time   := p_end_time;
        IF v_end_time <= v_start_time AND p_duration IS NOT NULL THEN
            v_end_time := v_start_time + (p_duration || ' seconds')::interval;
        END IF;
        v_total_duration := extract(epoch from (v_end_time - v_start_time))::integer;
    ELSE
        SELECT start_time INTO v_start_time FROM public.time_entry WHERE id = p_entry_id;
        v_total_duration := COALESCE(p_duration, FLOOR(v_seg_total))::integer;
        v_end_time := v_start_time + (v_total_duration || ' seconds')::interval;
    END IF;

    IF v_total_duration > 0 THEN
        v_total_duration := CEIL(v_total_duration / 60.0)::integer * 60;
        v_end_time := v_start_time + (v_total_duration || ' seconds')::interval;
    END IF;

    UPDATE public.time_entry
       SET start_time  = v_start_time,
           end_time    = v_end_time,
           duration    = v_total_duration::integer,
           comment     = p_comment,
           board_id    = p_board_id,
           item_id     = p_item_id,
           role_id     = p_role_id,
           timer_state = CASE WHEN p_keep_draft THEN 'parked'::public.timer_state ELSE 'finalized'::public.timer_state END,
           updated_at  = now(),
           updated_by  = p_user_id
     WHERE id = p_entry_id AND user_id = p_user_id
    RETURNING * INTO v_entry;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timer not found or not owned: %', p_entry_id;
    END IF;

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.timer_park(p_user_id uuid, p_entry_id uuid, p_comment text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_park(p_user_id uuid, p_entry_id uuid, p_comment text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_finalize(p_user_id uuid, p_entry_id uuid, p_task_name text, p_comment text, p_board_id text, p_item_id text, p_role_id uuid, p_board_name text, p_item_name text, p_parent_item_id text, p_parent_item_name text, p_duration integer, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_keep_draft boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_finalize(p_user_id uuid, p_entry_id uuid, p_task_name text, p_comment text, p_board_id text, p_item_id text, p_role_id uuid, p_board_name text, p_item_name text, p_parent_item_id text, p_parent_item_name text, p_duration integer, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_keep_draft boolean) TO service_role;
