-- Migration: 030_timer_rls_realtime_drop_session.sql
-- Wave 2 (BREAKING) of the timer 2-table redesign — see docs/timer-redesign.md.
--
-- Rewrites timer_segment RLS to key on entry_id, turns on cross-device realtime
-- for time_entry (replacing the timer_session-based realtime from migration 010),
-- drops the now-unreferenced legacy timer functions, and drops the timer_session
-- table. Apply together with 029 and the is_draft-free app deploy.

-- ============================================
-- 1. Rewrite timer_segment RLS — key on entry_id -> time_entry.user_id
-- ============================================
DROP POLICY IF EXISTS "Users can manage their timer_segments" ON public.timer_segment;

CREATE POLICY "Users can manage their timer_segments"
    ON public.timer_segment FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.time_entry te
            WHERE te.id = timer_segment.entry_id
            AND te.user_id IN (SELECT id FROM public.user_profiles WHERE id = te.user_id)
        )
    );

DROP POLICY IF EXISTS "Allow anon select for timer_segment" ON public.timer_segment;

CREATE POLICY "Allow anon select for timer_segment"
    ON public.timer_segment FOR SELECT
    USING (true);

-- ============================================
-- 2. Realtime — add time_entry, drop timer_session from the publication
-- ============================================
ALTER TABLE public.time_entry REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'time_entry'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.time_entry;
        END IF;

        IF EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'timer_session'
        ) THEN
            ALTER PUBLICATION supabase_realtime DROP TABLE public.timer_session;
        END IF;
    END IF;
END $$;

-- ============================================
-- 3. Drop the now-unreferenced legacy timer functions
-- ============================================
DROP FUNCTION IF EXISTS public.get_timer_session_with_elapsed(UUID);
DROP FUNCTION IF EXISTS public.get_current_elapsed_time(UUID);
DROP FUNCTION IF EXISTS public.finalize_segment(UUID);
DROP FUNCTION IF EXISTS public.soft_reset_timer(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.finalize_draft(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.finalize_time_entry(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ
);

-- ============================================
-- 4. Drop the timer_session table (cascades its RLS policies and the draft_id FK)
-- ============================================
DROP TABLE IF EXISTS public.timer_session CASCADE;
