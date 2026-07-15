-- Migration: 036_revoke_function_execute.sql
-- Description: Close the RPC hole left open by the RLS lockdown in 034/035, and
--              pin function search_path.
--
-- Context (same threat model as 034_rls_lockdown.sql): the anon key ships in the
-- browser bundle and PostgREST is publicly reachable, so anything the anon role
-- can do is effectively public. 034 closed anon table access but did NOT touch
-- function EXECUTE grants. Every public function below is still callable by the
-- anon role via /rest/v1/rpc/<name>, and the SECURITY DEFINER ones (which bypass
-- RLS and take p_user_id as an argument rather than deriving identity) let an
-- anonymous caller read/write arbitrary users' data and run purge_trashed_monday_items.
--
-- This is safe to lock down: every RPC in the app is called through supabaseAdmin
-- (service-role) — verified across app/api/timer/*, lib/columnSync.ts,
-- lib/database.ts. Nothing client-side calls .rpc() (the anon client is used only
-- for realtime table subscriptions, which are unaffected). The three SECURITY
-- INVOKER functions are a trigger function (update_updated_at_column) and two
-- functions never invoked via RPC (add_default_roles, get_effective_hourly_rate).
--
-- Signatures below were read live from pg_proc via `supabase db query --linked`,
-- including both timer_finalize overloads (with/without p_keep_draft).

-- ============================================================================
-- Part A — Pin search_path (lint 0011 function_search_path_mutable)
--   Fixed to `public, pg_temp` so a caller can't inject a schema to shadow the
--   tables these functions reference. Bodies reference only public.* tables and
--   pg_catalog builtins (e.g. gen_random_uuid), so this changes no behavior.
-- ============================================================================

ALTER FUNCTION public.add_default_roles() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_effective_hourly_rate(p_board_id text, p_role_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.calculate_remaining_budget(p_board_id text, p_item_ids text[], p_budget_amount numeric, p_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_active_timers(p_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_item_time_by_role(p_item_ids text[], p_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_item_time_entries(p_item_id text, p_board_id text, p_start_date timestamp with time zone, p_end_date timestamp with time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_item_total_time(p_item_ids text[], p_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_time_entries(p_user_id uuid, p_limit integer, p_offset integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.purge_trashed_monday_items(p_days integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.timer_park(p_user_id uuid, p_entry_id uuid, p_comment text) SET search_path = public, pg_temp;
ALTER FUNCTION public.timer_pause(p_user_id uuid, p_entry_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.timer_reset(p_user_id uuid, p_entry_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.timer_resume(p_user_id uuid, p_entry_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.timer_start(p_user_id uuid, p_board_id text, p_item_id text, p_role_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.timer_finalize(p_user_id uuid, p_entry_id uuid, p_task_name text, p_comment text, p_board_id text, p_item_id text, p_role_id uuid, p_board_name text, p_item_name text, p_parent_item_id text, p_parent_item_name text, p_duration integer, p_start_time timestamp with time zone, p_end_time timestamp with time zone) SET search_path = public, pg_temp;
ALTER FUNCTION public.timer_finalize(p_user_id uuid, p_entry_id uuid, p_task_name text, p_comment text, p_board_id text, p_item_id text, p_role_id uuid, p_board_name text, p_item_name text, p_parent_item_id text, p_parent_item_name text, p_duration integer, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_keep_draft boolean) SET search_path = public, pg_temp;

-- ============================================================================
-- Part B — Revoke EXECUTE from the public REST roles (lints 0028 / 0029)
--   Must revoke from PUBLIC: anon/authenticated inherit EXECUTE *through* PUBLIC,
--   so revoking from them alone would leave the grant intact. service_role is
--   then re-granted explicitly — it is what supabaseAdmin authenticates as, and
--   is the only principal the app uses to call these.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.add_default_roles() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.add_default_roles() TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_effective_hourly_rate(p_board_id text, p_role_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_effective_hourly_rate(p_board_id text, p_role_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.calculate_remaining_budget(p_board_id text, p_item_ids text[], p_budget_amount numeric, p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.calculate_remaining_budget(p_board_id text, p_item_ids text[], p_budget_amount numeric, p_user_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_active_timers(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_active_timers(p_user_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_item_time_by_role(p_item_ids text[], p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_item_time_by_role(p_item_ids text[], p_user_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_item_time_entries(p_item_id text, p_board_id text, p_start_date timestamp with time zone, p_end_date timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_item_time_entries(p_item_id text, p_board_id text, p_start_date timestamp with time zone, p_end_date timestamp with time zone) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_item_total_time(p_item_ids text[], p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_item_total_time(p_item_ids text[], p_user_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_time_entries(p_user_id uuid, p_limit integer, p_offset integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_time_entries(p_user_id uuid, p_limit integer, p_offset integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.purge_trashed_monday_items(p_days integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_trashed_monday_items(p_days integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_park(p_user_id uuid, p_entry_id uuid, p_comment text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_park(p_user_id uuid, p_entry_id uuid, p_comment text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_pause(p_user_id uuid, p_entry_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_pause(p_user_id uuid, p_entry_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_reset(p_user_id uuid, p_entry_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_reset(p_user_id uuid, p_entry_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_resume(p_user_id uuid, p_entry_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_resume(p_user_id uuid, p_entry_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_start(p_user_id uuid, p_board_id text, p_item_id text, p_role_id uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_start(p_user_id uuid, p_board_id text, p_item_id text, p_role_id uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_finalize(p_user_id uuid, p_entry_id uuid, p_task_name text, p_comment text, p_board_id text, p_item_id text, p_role_id uuid, p_board_name text, p_item_name text, p_parent_item_id text, p_parent_item_name text, p_duration integer, p_start_time timestamp with time zone, p_end_time timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_finalize(p_user_id uuid, p_entry_id uuid, p_task_name text, p_comment text, p_board_id text, p_item_id text, p_role_id uuid, p_board_name text, p_item_name text, p_parent_item_id text, p_parent_item_name text, p_duration integer, p_start_time timestamp with time zone, p_end_time timestamp with time zone) TO service_role;

REVOKE EXECUTE ON FUNCTION public.timer_finalize(p_user_id uuid, p_entry_id uuid, p_task_name text, p_comment text, p_board_id text, p_item_id text, p_role_id uuid, p_board_name text, p_item_name text, p_parent_item_id text, p_parent_item_name text, p_duration integer, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_keep_draft boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.timer_finalize(p_user_id uuid, p_entry_id uuid, p_task_name text, p_comment text, p_board_id text, p_item_id text, p_role_id uuid, p_board_name text, p_item_name text, p_parent_item_id text, p_parent_item_name text, p_duration integer, p_start_time timestamp with time zone, p_end_time timestamp with time zone, p_keep_draft boolean) TO service_role;
