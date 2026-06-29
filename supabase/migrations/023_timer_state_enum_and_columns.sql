-- Migration: 023_timer_state_enum_and_columns.sql
-- Wave 1 (live-safe, additive) of the timer 2-table redesign — see docs/timer-redesign.md.
--
-- Adds the `timer_state` enum + a nullable discriminator column on time_entry, and a
-- nullable `entry_id` on timer_segment that points directly at the owning time_entry
-- (the eventual replacement for `session_id`). Nothing is dropped here, so the currently
-- deployed app keeps working unchanged. The columns are backfilled in 024 and made
-- NOT NULL / have their old counterparts dropped in the breaking wave (027).

-- timer_state enum (idempotent: tolerate re-runs of `supabase db reset`)
DO $$ BEGIN
    CREATE TYPE public.timer_state AS ENUM ('running', 'paused', 'parked', 'finalized');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Discriminator on time_entry (nullable until 024 backfills it)
ALTER TABLE public.time_entry
    ADD COLUMN IF NOT EXISTS timer_state public.timer_state;

-- Segments point at the entry directly (new segments set entry_id instead of session_id)
ALTER TABLE public.timer_segment
    ADD COLUMN IF NOT EXISTS entry_id UUID REFERENCES public.time_entry(id) ON DELETE CASCADE;

-- The new timer RPCs (025) insert segments with entry_id and no session_id, so the
-- legacy NOT NULL on session_id must be relaxed now. The column itself is dropped in 027.
-- (Live-safe: the old app still inserts segments with session_id, which stays valid.)
ALTER TABLE public.timer_segment
    ALTER COLUMN session_id DROP NOT NULL;

COMMENT ON COLUMN public.time_entry.timer_state IS
    'Lifecycle discriminator (running|paused|parked|finalized). Replaces is_draft, which is dropped in migration 027.';
COMMENT ON COLUMN public.timer_segment.entry_id IS
    'Owning time_entry. Replaces session_id (dropped in 027) — segments reference the entry directly, not a timer_session.';
