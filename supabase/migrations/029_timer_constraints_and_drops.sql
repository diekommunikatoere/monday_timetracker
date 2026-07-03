-- Migration: 029_timer_constraints_and_drops.sql
-- Wave 2 (BREAKING) of the timer 2-table redesign — see docs/timer-redesign.md.
--
-- Makes timer_state the sole lifecycle discriminator, drops is_draft and its
-- companion legacy columns, and adds the invariant constraints. Apply together
-- with 030 and the is_draft-free app deploy, during a drain/freeze window
-- (stop starting timers + pause manual entry add/edit beforehand).
--
-- Order matters: nothing here drops a column/object while a still-live function
-- or index references it.

-- ============================================
-- 1. Final backfill — catch rows the old app wrote during the Wave 1 window
-- ============================================
UPDATE public.time_entry
   SET timer_state = CASE WHEN is_draft THEN 'parked'::public.timer_state ELSE 'finalized'::public.timer_state END
 WHERE timer_state IS NULL;

-- ============================================
-- 2. timer_finalize — drop the is_draft write (only RPC that writes the column)
-- ============================================
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
-- 3. Swap the 5 read/aggregate functions from is_draft = false -> timer_state = 'finalized'
-- ============================================

-- 3a. get_item_total_time (filter-only, no signature change)
CREATE OR REPLACE FUNCTION public.get_item_total_time(
    p_item_ids TEXT[],
    p_user_id UUID DEFAULT NULL
)
RETURNS BIGINT AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(te.duration)
         FROM public.time_entry te
         WHERE (te.item_id = ANY(p_item_ids)
                OR te.item_id IN (
                    SELECT mi.id FROM public.monday_item mi
                    WHERE mi.parent_item_id = ANY(p_item_ids)
                      AND mi.deleted_at IS NULL
                ))
           AND te.timer_state = 'finalized'
           AND te.deleted_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM public.monday_item mi_del
               WHERE mi_del.id = te.item_id AND mi_del.deleted_at IS NOT NULL
           )
           AND (p_user_id IS NULL OR te.user_id = p_user_id)),
        0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3b. get_item_time_by_role (filter-only, no signature change)
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
    WHERE (te.item_id = ANY(p_item_ids)
           OR te.item_id IN (
               SELECT mi.id FROM public.monday_item mi
               WHERE mi.parent_item_id = ANY(p_item_ids)
                 AND mi.deleted_at IS NULL
           ))
      AND te.timer_state = 'finalized'
      AND te.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.monday_item mi_del
          WHERE mi_del.id = te.item_id AND mi_del.deleted_at IS NOT NULL
      )
      AND (p_user_id IS NULL OR te.user_id = p_user_id)
      AND te.role_id IS NOT NULL
    GROUP BY te.role_id, r.name
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3c. calculate_remaining_budget (filter-only, no signature change)
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
    WHERE (te.item_id = ANY(p_item_ids)
           OR te.item_id IN (
               SELECT mi.id FROM public.monday_item mi
               WHERE mi.parent_item_id = ANY(p_item_ids)
                 AND mi.deleted_at IS NULL
           ))
      AND te.timer_state = 'finalized'
      AND te.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.monday_item mi_del
          WHERE mi_del.id = te.item_id AND mi_del.deleted_at IS NOT NULL
      )
      AND (p_user_id IS NULL OR te.user_id = p_user_id);

    v_remaining := p_budget_amount - v_total_cost;
    v_utilization := CASE
        WHEN p_budget_amount > 0 THEN (v_total_cost / p_budget_amount) * 100
        ELSE 0
    END;

    RETURN QUERY SELECT p_budget_amount, v_total_cost, v_remaining, v_utilization;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3d. get_item_time_entries — swap filter AND replace the is_draft output column
-- with timer_state (RETURNS TABLE shape changes -> DROP FUNCTION + recreate).
DROP FUNCTION IF EXISTS public.get_item_time_entries(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_item_time_entries(
    p_item_id TEXT,
    p_board_id TEXT,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    user_name TEXT,
    user_photo_urls JSONB,
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
    timer_state public.timer_state,
    synced_to_monday BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.id,
        te.user_id,
        up.name as user_name,
        up.photo_urls as user_photo_urls,
        COALESCE(mi.name, 'Unzugeordneter Zeiteintrag') as task_name,
        te.start_time,
        te.end_time,
        te.duration,
        te.board_id,
        mb.name as board_name,
        te.item_id,
        mi.name as item_name,
        mi.parent_item_id,
        mpi.name as parent_item_name,
        te.role_id,
        r.name as role_name,
        te.comment,
        te.timer_state,
        te.synced_to_monday,
        te.created_at,
        te.updated_at
    FROM public.time_entry te
    LEFT JOIN public.user_profiles up ON te.user_id = up.id
    LEFT JOIN public.monday_board mb ON te.board_id = mb.id
    LEFT JOIN public.monday_item mi ON te.item_id = mi.id
    LEFT JOIN public.monday_item mpi ON mi.parent_item_id = mpi.id
    LEFT JOIN public.role r ON te.role_id = r.id
    WHERE te.item_id = p_item_id
      AND te.board_id = p_board_id
      AND te.deleted_at IS NULL
      AND te.timer_state = 'finalized'
      AND (mi.id IS NULL OR mi.deleted_at IS NULL)
      AND (p_start_date IS NULL OR te.start_time >= p_start_date)
      AND (p_end_date IS NULL OR te.start_time <= p_end_date)
    ORDER BY te.start_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3e. get_user_time_entries — drop the is_draft output column and the
-- transitional COALESCE(...timer_state...) fallback; keep plain te.timer_state.
-- Shows all non-finalized rows too, so no timer_state filter here.
DROP FUNCTION IF EXISTS public.get_user_time_entries(UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_user_time_entries(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    user_name TEXT,
    user_photo_urls JSONB,
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
    synced_to_monday BOOLEAN,
    timer_state public.timer_state,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.id,
        te.user_id,
        up.name as user_name,
        up.photo_urls as user_photo_urls,
        COALESCE(mi.name, 'Unzugeordneter Zeiteintrag') as task_name,
        te.start_time,
        te.end_time,
        te.duration,
        te.board_id,
        mb.name as board_name,
        te.item_id,
        mi.name as item_name,
        mi.parent_item_id,
        mpi.name as parent_item_name,
        te.role_id,
        r.name as role_name,
        te.comment,
        te.synced_to_monday,
        te.timer_state,
        te.created_at,
        te.updated_at
    FROM public.time_entry te
    LEFT JOIN public.user_profiles up ON te.user_id = up.id
    LEFT JOIN public.monday_board mb ON te.board_id = mb.id
    LEFT JOIN public.monday_item mi ON te.item_id = mi.id
    LEFT JOIN public.monday_item mpi ON mi.parent_item_id = mpi.id
    LEFT JOIN public.role r ON te.role_id = r.id
    WHERE te.user_id = p_user_id
    AND te.deleted_at IS NULL
    AND (mi.id IS NULL OR mi.deleted_at IS NULL)
    ORDER BY te.start_time DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. Dedup to one running timer per user (defensive; 027's guard already
--    prevents >1 active, this only protects against pre-027 stragglers)
-- ============================================
WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY user_id ORDER BY updated_at DESC) AS rn
      FROM public.time_entry
     WHERE timer_state = 'running'
)
UPDATE public.time_entry te
   SET timer_state = 'paused', updated_at = now()
  FROM ranked
 WHERE te.id = ranked.id AND ranked.rn > 1;

-- ============================================
-- 5. NOT NULL on the new discriminator columns
-- ============================================
ALTER TABLE public.time_entry ALTER COLUMN timer_state SET NOT NULL;
ALTER TABLE public.timer_segment ALTER COLUMN entry_id SET NOT NULL;

-- ============================================
-- 6. Unique indexes + CHECK constraints (invariants)
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS one_running_timer_per_user
    ON public.time_entry(user_id) WHERE timer_state = 'running';

CREATE UNIQUE INDEX IF NOT EXISTS one_open_segment_per_entry
    ON public.timer_segment(entry_id) WHERE end_time IS NULL;

CREATE INDEX IF NOT EXISTS idx_timer_segment_entry_end
    ON public.timer_segment(entry_id, end_time NULLS FIRST);

ALTER TABLE public.time_entry
    ADD CONSTRAINT time_entry_finalized_complete
    CHECK (timer_state <> 'finalized' OR (duration IS NOT NULL AND end_time IS NOT NULL));

-- ============================================
-- 7. Drops — is_draft and its companion legacy columns
-- ============================================
DROP INDEX IF EXISTS idx_time_entry_is_draft;

ALTER TABLE public.time_entry
    DROP COLUMN IF EXISTS is_draft,
    DROP COLUMN IF EXISTS timer_session;

-- The legacy timer_segment RLS policy (mig 006) references session_id, so it must
-- be dropped before the column. Migration 030 recreates it keyed on entry_id
-- (idempotent DROP POLICY IF EXISTS there), so applying 029 + 030 together is safe.
DROP POLICY IF EXISTS "Users can manage their timer_segments" ON public.timer_segment;

ALTER TABLE public.timer_segment
    DROP COLUMN IF EXISTS session_id,
    DROP COLUMN IF EXISTS duration;
