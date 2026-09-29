-- Migration: 043_permissions_and_time_entry_audit.sql
-- Description: DB-backed permission grants + audit trail for time entries.
--
--   a) time_entry.created_by / updated_by (who performed the write; may differ from user_id
--      once privileged users can book/edit time in someone else's name)
--   b) time_entry_log — history of finalized/parked entry changes, written by a trigger
--   c) log_time_entry_change() trigger function
--   d) permission_grant — grants of a named permission to a user OR a monday team
--   e) timer RPCs re-created so they stamp updated_by (needed for correct log attribution)
--
-- Both new tables are service-role only (same threat model as 034/036: the anon key ships in
-- the browser bundle, so RLS-on-with-no-policies + revoked table privileges is the only
-- acceptable posture).

-- ============================================================================
-- a) Audit columns on time_entry
-- ============================================================================

ALTER TABLE public.time_entry
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- Backfill (the log trigger does not exist yet, so this produces no log rows).
UPDATE public.time_entry
   SET created_by = user_id,
       updated_by = user_id
 WHERE created_by IS NULL AND updated_by IS NULL;

-- ============================================================================
-- b) time_entry_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.time_entry_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entry_id    uuid NOT NULL,   -- no FK: the log must survive hard deletes
    action      text NOT NULL CHECK (action IN ('create', 'update', 'soft_delete', 'restore', 'hard_delete')),
    actor_id    uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,  -- NULL = system
    owner_id    uuid,            -- entry.user_id after the change (OLD for delete)
    changes     jsonb NOT NULL,  -- insert/delete: full snapshot; update: {col: {old, new}}
    changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entry_log_entry_changed_at ON public.time_entry_log (entry_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_time_entry_log_owner_changed_at ON public.time_entry_log (owner_id, changed_at);

ALTER TABLE public.time_entry_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.time_entry_log FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- c) Trigger: log_time_entry_change()
-- ============================================================================
-- Scope: only rows that are (or become / were) finalized or parked. Pure running/paused churn
-- and live-timer comment auto-saves are skipped. UPDATE diffs ignore updated_at, updated_by
-- and synced_to_monday; an empty diff writes no row.

CREATE OR REPLACE FUNCTION public.log_time_entry_change()
RETURNS trigger AS $$
DECLARE
    v_changes jsonb;
    v_action  text;
    v_actor   uuid;
    v_owner   uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.timer_state NOT IN ('finalized', 'parked') THEN
            RETURN NEW;
        END IF;
        INSERT INTO public.time_entry_log (entry_id, action, actor_id, owner_id, changes)
        VALUES (NEW.id, 'create', NEW.created_by, NEW.user_id, to_jsonb(NEW));
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.timer_state NOT IN ('finalized', 'parked') THEN
            RETURN OLD;
        END IF;
        -- Actor NULL = system (cron purge / timer_reset of a parked entry). The soft delete that
        -- precedes a purge has already recorded the human actor.
        INSERT INTO public.time_entry_log (entry_id, action, actor_id, owner_id, changes)
        VALUES (OLD.id, 'hard_delete', NULL, OLD.user_id, to_jsonb(OLD));
        RETURN OLD;

    ELSE -- UPDATE
        IF OLD.timer_state NOT IN ('finalized', 'parked') AND NEW.timer_state NOT IN ('finalized', 'parked') THEN
            RETURN NEW;
        END IF;

        SELECT jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
          INTO v_changes
          FROM jsonb_each(to_jsonb(NEW)) n
          LEFT JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
         WHERE n.key NOT IN ('updated_at', 'updated_by', 'synced_to_monday')
           AND n.value IS DISTINCT FROM o.value;

        IF v_changes IS NULL THEN
            RETURN NEW;
        END IF;

        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            v_action := 'soft_delete';
        ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            v_action := 'restore';
        ELSE
            v_action := 'update';
        END IF;

        v_actor := NEW.updated_by;
        v_owner := NEW.user_id;

        INSERT INTO public.time_entry_log (entry_id, action, actor_id, owner_id, changes)
        VALUES (NEW.id, v_action, v_actor, v_owner, v_changes);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.log_time_entry_change() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.log_time_entry_change() TO service_role;

DROP TRIGGER IF EXISTS log_time_entry_change ON public.time_entry;
CREATE TRIGGER log_time_entry_change
    AFTER INSERT OR UPDATE OR DELETE ON public.time_entry
    FOR EACH ROW EXECUTE FUNCTION public.log_time_entry_change();

-- ============================================================================
-- d) permission_grant
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.permission_grant (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    permission  text NOT NULL CHECK (permission IN ('time_entries.manage_others', 'analytics.auswertung')),
    user_id     uuid REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    team_id     text,
    created_by  uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CHECK (num_nonnulls(user_id, team_id) = 1),
    UNIQUE (permission, user_id),
    UNIQUE (permission, team_id)
);

ALTER TABLE public.permission_grant ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.permission_grant FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- e) Timer RPCs: stamp the actor (updated_by / created_by)
-- ============================================================================
-- Each function is re-created from its latest definition (start: 027, pause/reset: 025,
-- resume/park: 028, finalize: 032). The only change is the updated_by / created_by stamp.
-- CREATE OR REPLACE resets per-function config, so the 036 search_path pin is re-applied via
-- SET, and EXECUTE grants are re-applied at the end.
--
-- NOTE: the legacy 14-arg timer_finalize overload (029) is not called by the app and is left
-- untouched.

CREATE OR REPLACE FUNCTION public.timer_start(
    p_user_id  uuid,
    p_board_id text DEFAULT NULL,
    p_item_id  text DEFAULT NULL,
    p_role_id  uuid DEFAULT NULL
) RETURNS public.time_entry AS $$
DECLARE
    v_entry public.time_entry;
BEGIN
    -- Interim single-timer guard (see 027).
    IF EXISTS (
        SELECT 1 FROM public.time_entry
         WHERE user_id = p_user_id
           AND timer_state IN ('running', 'paused')
    ) THEN
        RAISE EXCEPTION 'ACTIVE_TIMER_EXISTS';
    END IF;

    INSERT INTO public.time_entry (user_id, timer_state, board_id, item_id, role_id, created_by, updated_by)
    VALUES (p_user_id, 'running', p_board_id, p_item_id, p_role_id, p_user_id, p_user_id)
    RETURNING * INTO v_entry;

    INSERT INTO public.timer_segment (entry_id) VALUES (v_entry.id);

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.timer_pause(
    p_user_id  uuid,
    p_entry_id uuid
) RETURNS public.time_entry AS $$
DECLARE
    v_entry public.time_entry;
BEGIN
    UPDATE public.timer_segment SET end_time = now()
     WHERE entry_id = p_entry_id AND end_time IS NULL;

    UPDATE public.time_entry
       SET timer_state = 'paused', updated_at = now(), updated_by = p_user_id
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
       SET timer_state = 'paused', updated_at = now(), updated_by = p_user_id
     WHERE user_id = p_user_id AND timer_state = 'running' AND id <> p_entry_id;

    UPDATE public.time_entry
       SET timer_state = 'running', updated_at = now(), updated_by = p_user_id
     WHERE id = p_entry_id AND user_id = p_user_id
       AND timer_state = 'paused'
    RETURNING * INTO v_entry;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Timer not found, not owned, or not resumable: %', p_entry_id;
    END IF;

    INSERT INTO public.timer_segment (entry_id) VALUES (v_entry.id);

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
        v_total_duration := COALESCE(p_duration, v_seg_total)::integer;
        v_end_time := v_start_time + (v_total_duration || ' seconds')::interval;
    END IF;

    IF v_total_duration > 0 AND v_total_duration < 60 THEN
        v_total_duration := 60;
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

-- timer_reset (025) is intentionally not re-created: it only DELETEs (no UPDATE/INSERT to
-- stamp), and the trigger logs that DELETE with actor NULL (= system).

-- Re-apply EXECUTE lockdown (signatures from 036).
REVOKE EXECUTE ON FUNCTION public.timer_start(p_user_id uuid, p_board_id text, p_item_id text, p_role_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_start(p_user_id uuid, p_board_id text, p_item_id text, p_role_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_pause(p_user_id uuid, p_entry_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_pause(p_user_id uuid, p_entry_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_resume(p_user_id uuid, p_entry_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_resume(p_user_id uuid, p_entry_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_park(p_user_id uuid, p_entry_id uuid, p_comment text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_park(p_user_id uuid, p_entry_id uuid, p_comment text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_finalize(p_user_id uuid, p_entry_id uuid, p_task_name text, p_comment text, p_board_id text, p_item_id text, p_role_id uuid, p_board_name text, p_item_name text, p_parent_item_id text, p_parent_item_name text, p_duration integer, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_keep_draft boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_finalize(p_user_id uuid, p_entry_id uuid, p_task_name text, p_comment text, p_board_id text, p_item_id text, p_role_id uuid, p_board_name text, p_item_name text, p_parent_item_id text, p_parent_item_name text, p_duration integer, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_keep_draft boolean) TO service_role;
