-- Migration: 010_fix_timer_realtime.sql
-- Description: Enables Real-time synchronization for active timer sessions.
-- This allows the frontend (using the anon key) to receive updates when a timer is started/paused on another device.

-- 1. Allow anonymous read access to active timer sessions and segments
-- This is required because the frontend connects via the 'anon' key without Supabase Auth.
-- Security: This makes active timer UUIDs and start times visible to anyone with the anon key,
-- but does not expose historical time entries or personal data beyond what is already public.

CREATE POLICY "Allow anon select for timer_session"
    ON public.timer_session FOR SELECT
    USING (true);

CREATE POLICY "Allow anon select for timer_segment"
    ON public.timer_segment FOR SELECT
    USING (true);

-- 2. Enable Real-time replication for these tables
-- This tells Postgres to send change events to the Supabase Realtime service.

ALTER TABLE public.timer_session REPLICA IDENTITY FULL;
ALTER TABLE public.timer_segment REPLICA IDENTITY FULL;

-- Add tables to the publication (if not already present)
-- Note: In some Supabase setups, the publication is called 'supabase_realtime'
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.timer_session;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.timer_segment;
    END IF;
END $$;
