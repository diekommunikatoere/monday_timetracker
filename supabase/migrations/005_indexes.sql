-- Migration: 005_indexes.sql
-- All indexes (lexical order)
-- Migration: index_role
-- Performance indexes for role table

CREATE INDEX idx_role_name ON public.role(name);-- Migration: index_time_entry
-- Performance indexes for time_entry table

CREATE INDEX idx_time_entry_user_id ON public.time_entry(user_id);
CREATE INDEX idx_time_entry_is_draft ON public.time_entry(is_draft);
CREATE INDEX idx_time_entry_synced_to_monday ON public.time_entry(synced_to_monday);
CREATE INDEX idx_time_entry_created_at ON public.time_entry(created_at DESC);
CREATE INDEX idx_time_entry_board_item ON public.time_entry(board_id, item_id);-- Migration: index_timer_segment
-- Performance indexes for timer_segment table

CREATE INDEX idx_timer_segment_session_id ON public.timer_segment(session_id);

-- Composite index for efficient session segment queries (open segments first)
CREATE INDEX idx_timer_segment_session_end
    ON public.timer_segment(session_id, end_time NULLS FIRST);-- Migration: index_timer_session
-- Performance indexes for timer_session table

CREATE INDEX idx_timer_session_user_id ON public.timer_session(user_id);
CREATE INDEX idx_timer_session_draft_id ON public.timer_session(draft_id);

-- Partial unique index: enforce one active (non-paused with open segments) session per user
-- This prevents users from having multiple running timers simultaneously
CREATE UNIQUE INDEX idx_timer_session_user_active
    ON public.timer_session(user_id)
    WHERE (is_paused = false);-- Migration: index_user_profiles
-- Performance indexes for user_profiles table

CREATE INDEX idx_user_profiles_monday_user_id ON public.user_profiles(monday_user_id);
CREATE INDEX idx_user_profiles_monday_account_id ON public.user_profiles(monday_account_id);