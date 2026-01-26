-- Migration: 005_indexes.sql
-- Description: Consolidated index definitions for the timetracker backend.

-- ============================================
-- 1. Core Table Indexes
-- ============================================

-- user_profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_monday_user_id ON public.user_profiles(monday_user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_monday_account_id ON public.user_profiles(monday_account_id);

-- role
CREATE INDEX IF NOT EXISTS idx_role_name ON public.role(name);

-- time_entry
CREATE INDEX IF NOT EXISTS idx_time_entry_user_id ON public.time_entry(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_is_draft ON public.time_entry(is_draft);
CREATE INDEX IF NOT EXISTS idx_time_entry_synced_to_monday ON public.time_entry(synced_to_monday);
CREATE INDEX IF NOT EXISTS idx_time_entry_created_at ON public.time_entry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entry_board_item ON public.time_entry(board_id, item_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_role_id ON public.time_entry(role_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_deleted_at ON public.time_entry(deleted_at) WHERE deleted_at IS NOT NULL;

-- timer_session
CREATE INDEX IF NOT EXISTS idx_timer_session_user_id ON public.timer_session(user_id);
CREATE INDEX IF NOT EXISTS idx_timer_session_draft_id ON public.timer_session(draft_id);
-- Partial unique index: enforce one active (non-paused) session per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_timer_session_user_active ON public.timer_session(user_id) WHERE (is_paused = false);

-- timer_segment
CREATE INDEX IF NOT EXISTS idx_timer_segment_session_id ON public.timer_segment(session_id);
-- Composite index for efficient session segment queries (open segments first)
CREATE INDEX IF NOT EXISTS idx_timer_segment_session_end ON public.timer_segment(session_id, end_time NULLS FIRST);

-- ============================================
-- 2. Dimension Table Indexes
-- ============================================

-- monday_item
CREATE INDEX IF NOT EXISTS idx_monday_item_board_id ON public.monday_item(board_id);
CREATE INDEX IF NOT EXISTS idx_monday_item_parent_item_id ON public.monday_item(parent_item_id);

-- monday_column
CREATE INDEX IF NOT EXISTS idx_monday_column_board_id ON public.monday_column(board_id);

-- ============================================
-- 3. Configuration & Sync Indexes
-- ============================================

-- board_config
CREATE INDEX IF NOT EXISTS idx_board_config_board_id ON public.board_config(board_id);

-- board_role_override
CREATE INDEX IF NOT EXISTS idx_board_role_override_board ON public.board_role_override(board_id);
CREATE INDEX IF NOT EXISTS idx_board_role_override_role ON public.board_role_override(role_id);

-- column_sync_config
CREATE INDEX IF NOT EXISTS idx_column_sync_board ON public.column_sync_config(board_id);
CREATE INDEX IF NOT EXISTS idx_column_sync_purpose ON public.column_sync_config(sync_purpose);

-- sync_log
CREATE INDEX IF NOT EXISTS idx_sync_log_board_item ON public.sync_log(board_id, item_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON public.sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_success ON public.sync_log(success);
