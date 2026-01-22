-- Migration: table_user_profiles
-- Links Monday.com users to Supabase
-- Includes team_ids array added later

CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monday_user_id TEXT NOT NULL UNIQUE,
    monday_account_id TEXT NOT NULL,
    email TEXT,
    name TEXT,
    team_ids text[] DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON COLUMN public.user_profiles.team_ids IS 'Array of Monday.com team IDs the user belongs to';

-- Migration: table_role
-- Stores available roles for time entries

CREATE TABLE public.role (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: table_time_entry
-- Stores time tracking entries (both drafts and finalized)
-- Includes all modifications: display names, parent items, timestamp defaults

CREATE TABLE public.time_entry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    task_name TEXT,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Uses DB server time for consistency
    end_time TIMESTAMPTZ,
    duration INTEGER, -- Duration in seconds
    board_id TEXT,
    board_name TEXT, -- Human-readable board name for display purposes
    item_id TEXT,
    item_name TEXT, -- Human-readable task/item name for display purposes
    parent_item_id TEXT, -- ID of the parent item (e.g. Monday.com parent item ID)
    parent_item_name TEXT, -- Human-readable parent item name for display purposes
    role TEXT,
    role_name TEXT, -- Human-readable role name for display purposes
    comment TEXT,
    is_draft BOOLEAN NOT NULL DEFAULT TRUE,
    synced_to_monday BOOLEAN NOT NULL DEFAULT FALSE,
    timer_session JSONB, -- Denormalized session data for history
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON COLUMN public.time_entry.board_name IS 'Human-readable board name for display purposes';
COMMENT ON COLUMN public.time_entry.item_name IS 'Human-readable task/item name for display purposes';
COMMENT ON COLUMN public.time_entry.role_name IS 'Human-readable role name for display purposes';
COMMENT ON COLUMN public.time_entry.parent_item_id IS 'ID of the parent item (e.g. Monday.com parent item ID)';
COMMENT ON COLUMN public.time_entry.parent_item_name IS 'Human-readable parent item name for display purposes';

-- Migration: table_timer_session
-- Tracks active timer sessions for users

CREATE TABLE public.timer_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    draft_id UUID REFERENCES public.time_entry(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Uses DB server time for consistency
    elapsed_time INTEGER NOT NULL DEFAULT 0, -- Elapsed time in milliseconds
    is_paused BOOLEAN NOT NULL DEFAULT FALSE,
    timer_segments JSONB, -- Denormalized segments for quick access
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: table_timer_segment
-- Individual running segments within a timer session

CREATE TABLE public.timer_segment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.timer_session(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Uses DB server time for consistency
    end_time TIMESTAMPTZ,
    duration INTEGER, -- Duration in milliseconds (computed on end)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);