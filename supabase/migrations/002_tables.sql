-- Migration: 002_tables.sql
-- Description: Consolidated table definitions for the timetracker backend.
-- This file contains the final state of all tables, incorporating all previous alterations.

-- ============================================
-- 1. Monday.com Dimension Tables (Metadata Cache)
-- ============================================

-- monday_board: Caches board names
CREATE TABLE IF NOT EXISTS public.monday_board (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- monday_item: Caches item names, board IDs, and hierarchy
CREATE TABLE IF NOT EXISTS public.monday_item (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    board_id TEXT NOT NULL,
    parent_item_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- monday_column: Caches board column metadata (ID, title, type)
CREATE TABLE IF NOT EXISTS public.monday_column (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id TEXT NOT NULL REFERENCES public.monday_board(id) ON DELETE CASCADE,
    monday_column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(board_id, monday_column_id)
);

-- ============================================
-- 2. Core Application Tables
-- ============================================

-- user_profiles: Links Monday.com users to Supabase
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monday_user_id TEXT NOT NULL UNIQUE,
    monday_account_id TEXT NOT NULL,
    email TEXT,
    name TEXT,
    team_ids TEXT[] DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- role: Stores available roles for time entries
CREATE TABLE IF NOT EXISTS public.role (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    hourly_rate DECIMAL(10,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    color_hex VARCHAR(7),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- time_entry: Stores time tracking entries (both drafts and finalized)
CREATE TABLE IF NOT EXISTS public.time_entry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    duration INTEGER, -- Duration in seconds
    board_id TEXT REFERENCES public.monday_board(id) ON DELETE SET NULL,
    item_id TEXT REFERENCES public.monday_item(id) ON DELETE SET NULL,
    parent_item_id TEXT, -- ID of the parent item (e.g. Monday.com parent item ID)
    role_id UUID REFERENCES public.role(id) ON DELETE SET NULL,
    comment TEXT,
    is_draft BOOLEAN NOT NULL DEFAULT TRUE,
    synced_to_monday BOOLEAN NOT NULL DEFAULT FALSE,
    timer_session JSONB, -- Denormalized session data for history
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    deleted_by VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- timer_session: Tracks active timer sessions for users
CREATE TABLE IF NOT EXISTS public.timer_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    draft_id UUID REFERENCES public.time_entry(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    elapsed_time INTEGER NOT NULL DEFAULT 0, -- Elapsed time in milliseconds
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    timer_segments JSONB, -- Denormalized segments for quick access
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- timer_segment: Individual running segments within a timer session
CREATE TABLE IF NOT EXISTS public.timer_segment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.timer_session(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    duration INTEGER, -- Duration in milliseconds (computed on end)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. Configuration & Sync Tables
-- ============================================

-- board_config: Board-level configuration for time tracking sync and budget settings
CREATE TABLE IF NOT EXISTS public.board_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id TEXT NOT NULL UNIQUE REFERENCES public.monday_board(id) ON DELETE CASCADE,
    sync_enabled BOOLEAN DEFAULT TRUE,
    
    -- Budget settings
    budget_column_id TEXT, -- monday.com column ID for budget source
    budget_column_type TEXT, -- 'numbers', 'formula', 'mirror'
    
    -- Sync settings
    sync_on_finalize BOOLEAN DEFAULT TRUE, -- Auto-sync when time entry finalized
    sync_budget_used BOOLEAN DEFAULT TRUE, -- Whether to sync the total expenditure (Total Cost)
    linked_board_id TEXT, -- Board ID to search for linked items when syncing
    sync_linked_items BOOLEAN DEFAULT FALSE, -- Whether to trigger sync for linked items
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- board_role_override: Board-specific hourly rate overrides for roles
CREATE TABLE IF NOT EXISTS public.board_role_override (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id TEXT NOT NULL REFERENCES public.board_config(board_id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.role(id) ON DELETE CASCADE,
    hourly_rate DECIMAL(10,2) NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(board_id, role_id)
);

-- column_sync_config: Maps monday.com columns to sync purposes
CREATE TABLE IF NOT EXISTS public.column_sync_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id TEXT NOT NULL REFERENCES public.board_config(board_id) ON DELETE CASCADE,
    
    -- Column identification
    column_id TEXT NOT NULL, -- monday.com column ID
    column_name TEXT NOT NULL, -- Human-readable column name
    column_type TEXT NOT NULL, -- 'numbers', 'text', 'long_text', 'time_tracking'
    
    -- Sync purpose
    sync_purpose TEXT NOT NULL DEFAULT 'budget_used', -- 'total_time', 'time_by_role', 'remaining_budget', 'budget_used'
    
    -- Format settings (historical/optional)
    time_format TEXT DEFAULT 'hours', -- 'hours', 'seconds', 'hh:mm'
    include_breakdown BOOLEAN DEFAULT FALSE,
    
    sync_enabled BOOLEAN DEFAULT TRUE,
    last_synced_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(board_id, column_id),
    CONSTRAINT column_sync_config_purpose_check CHECK (sync_purpose IN ('total_time', 'time_by_role', 'remaining_budget', 'budget_used')),
    CONSTRAINT column_sync_config_time_format_check CHECK (time_format IN ('hours', 'seconds', 'hh:mm'))
);

-- sync_log: Audit log of all column sync operations
CREATE TABLE IF NOT EXISTS public.sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id TEXT NOT NULL,
    item_id TEXT NOT NULL, -- monday.com item ID
    column_id TEXT NOT NULL, -- monday.com column ID
    sync_purpose TEXT NOT NULL,
    
    -- Sync details
    value_synced TEXT NOT NULL, -- JSON representation of the synced value
    success BOOLEAN NOT NULL,
    error_message TEXT, -- Error details if sync failed
    
    -- Metadata
    triggered_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    time_entry_id UUID REFERENCES public.time_entry(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 4. Comments
-- ============================================

COMMENT ON TABLE public.monday_board IS 'Caches Monday.com board names';
COMMENT ON TABLE public.monday_item IS 'Caches Monday.com item names and hierarchy';
COMMENT ON TABLE public.monday_column IS 'Caches Monday.com board column metadata';
COMMENT ON COLUMN public.user_profiles.team_ids IS 'Array of Monday.com team IDs the user belongs to';
COMMENT ON COLUMN public.role.hourly_rate IS 'Default hourly rate in currency units for budget calculations';
COMMENT ON COLUMN public.time_entry.role_id IS 'Foreign key to role table - use JOIN to get role name and other attributes';
COMMENT ON COLUMN public.time_entry.deleted_at IS 'Timestamp when entry was soft-deleted (NULL if not deleted)';
COMMENT ON TABLE public.board_config IS 'Simplified board-level configuration for time tracking sync and budget settings';
COMMENT ON COLUMN public.board_config.sync_budget_used IS 'Whether to sync the total expenditure (Total Cost) to the configured column';
COMMENT ON TABLE public.sync_log IS 'Audit log of all column sync operations for debugging and compliance';
