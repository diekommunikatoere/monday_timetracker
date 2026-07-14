-- Migration: 034_rls_lockdown.sql
-- Description: Close anon write access and non-realtime anon read access.
--
-- The anon key ships in the browser bundle and the Supabase REST API is
-- publicly reachable, so RLS is the only gate. Prior policies were effective
-- no-ops for time_entry/timer_segment (USING (true) / tautological subquery),
-- and 011_rls_security_patch.sql's write-policy DROPs used the wrong policy
-- names, so they never took effect. This migration drops the correct policy
-- names (verified live via `supabase db query --linked` against pg_policies).
--
-- All writes and all reads dropped here flow through supabaseAdmin
-- (service-role, RLS-bypassing) in server API routes, so none of this is
-- read/written by the client's anon key. time_entry SELECT is intentionally
-- kept — it backs the cross-device timer realtime subscription in
-- components/features/timer/hooks/useTimer.ts.

-- ============================================
-- 1. time_entry — drop write policies, keep SELECT (realtime)
-- ============================================
DROP POLICY IF EXISTS "Users can insert own time entries" ON public.time_entry;
DROP POLICY IF EXISTS "Users can update own time entries" ON public.time_entry;
DROP POLICY IF EXISTS "Users can delete own time entries" ON public.time_entry;

-- ============================================
-- 2. timer_segment — drop all access (no client dependency)
-- ============================================
DROP POLICY IF EXISTS "Users can manage their timer_segments" ON public.timer_segment;
DROP POLICY IF EXISTS "Allow anon select for timer_segment" ON public.timer_segment;

-- ============================================
-- 3. user_profiles — drop anon read/insert/update (server-only via service role)
-- ============================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

-- ============================================
-- 4. Configuration tables — drop anon SELECT
-- ============================================
DROP POLICY IF EXISTS "Board configs are viewable by all" ON public.board_config;
DROP POLICY IF EXISTS "Board role overrides are viewable by all" ON public.board_role_override;
DROP POLICY IF EXISTS "Column sync configs are viewable by all" ON public.column_sync_config;
DROP POLICY IF EXISTS "Sync logs are viewable by all" ON public.sync_log;
