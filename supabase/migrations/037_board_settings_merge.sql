-- Migration: 037_board_settings_merge.sql
-- Description: Atomic, merge-based update for board_config so a PATCH can never
--              clobber sibling keys in the settings JSONB.
--
-- Problem: the admin PATCH handler wrote board_config.settings wholesale
-- (updateData.settings = <client value>). settings (added in 033, jsonb NOT NULL
-- DEFAULT '{}') is a growing bag of flags — today just jobs_selectable. A client
-- sending a partial settings object, or a client whose in-memory copy is stale
-- relative to the DB, would silently drop keys it didn't know about. Merging on
-- the client narrowed but did not close this (last-writer-wins on a stale copy).
--
-- Fix: do the merge in Postgres with the `||` jsonb concat operator inside a
-- single UPDATE statement, so it is atomic (no read-modify-write race) and no
-- caller can ever delete a key it simply didn't send. `||` is a SHALLOW merge of
-- top-level keys, which is what the flat settings bag needs; a nested settings
-- value passed in p_patch replaces that whole subtree (acceptable — the app sends
-- flat keys).
--
-- The three scalar columns still editable from the admin screen are folded into
-- the same statement via COALESCE(param, existing) so a NULL argument means
-- "leave unchanged". Future config is expected to grow inside settings (the JSONB
-- patch), not as new scalar columns, so this signature should stay stable.
--
-- Returns the updated row and RAISEs if board_id matches nothing, so a bad id
-- surfaces as an error instead of a silent 200 (matches timer_* RPC precedent in
-- 025, and preserves the not-found behavior of the .single() call it replaces).
--
-- Security posture matches 036_revoke_function_execute.sql: search_path pinned,
-- EXECUTE revoked from the public REST roles and re-granted only to service_role
-- (this is called exclusively through supabaseAdmin).

CREATE OR REPLACE FUNCTION public.update_board_config(
    p_board_id        text,
    p_patch           jsonb   DEFAULT '{}'::jsonb,
    p_sync_enabled    boolean DEFAULT NULL,
    p_display_enabled boolean DEFAULT NULL,
    p_sort_order      integer DEFAULT NULL
) RETURNS public.board_config AS $$
DECLARE
    v_row public.board_config;
BEGIN
    UPDATE public.board_config
       SET settings        = COALESCE(settings, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb),
           sync_enabled    = COALESCE(p_sync_enabled, sync_enabled),
           display_enabled = COALESCE(p_display_enabled, display_enabled),
           sort_order      = COALESCE(p_sort_order, sort_order),
           updated_at      = now()
     WHERE board_id = p_board_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Board config not found: %', p_board_id;
    END IF;

    RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.update_board_config(text, jsonb, boolean, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_board_config(text, jsonb, boolean, boolean, integer) TO service_role;
