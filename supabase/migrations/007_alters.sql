-- Migration: Column Sync Feature
-- Adds support for syncing time tracking data to monday.com board columns
-- Includes role enhancements, board configurations, and sync logging

-- ============================================
-- Enhance Role Table with Hourly Rates
-- ============================================

-- Add hourly_rate column for budget calculations
ALTER TABLE public.role 
ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10,2) DEFAULT 0.00;

-- Add is_active flag for soft deletion
ALTER TABLE public.role 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Add color_hex for UI display
ALTER TABLE public.role 
ADD COLUMN IF NOT EXISTS color_hex VARCHAR(7);

COMMENT ON COLUMN public.role.hourly_rate IS 'Default hourly rate in currency units for budget calculations';
COMMENT ON COLUMN public.role.is_active IS 'Whether the role is currently available for selection';
COMMENT ON COLUMN public.role.color_hex IS 'Hex color code for role display in UI (e.g., #FF5733)';

-- ============================================
-- Board-Specific Configuration
-- ============================================

CREATE TABLE IF NOT EXISTS public.board_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id TEXT NOT NULL UNIQUE,
    board_name TEXT NOT NULL,
    sync_enabled BOOLEAN DEFAULT TRUE,
    
    -- Budget settings
    budget_column_id TEXT, -- monday.com column ID for budget source
    budget_column_type TEXT, -- 'numbers', 'formula', 'mirror'
    currency_symbol VARCHAR(5) DEFAULT '€',
    
    -- Sync settings
    sync_on_finalize BOOLEAN DEFAULT TRUE, -- Auto-sync when time entry finalized
    sync_total_time BOOLEAN DEFAULT TRUE, -- Sync total tracked time
    sync_time_by_role BOOLEAN DEFAULT TRUE, -- Sync time breakdown by role
    sync_remaining_budget BOOLEAN DEFAULT TRUE, -- Sync calculated remaining budget
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_board_config_board_id ON public.board_config(board_id);

COMMENT ON TABLE public.board_config IS 'Board-level configuration for time tracking sync and budget settings';
COMMENT ON COLUMN public.board_config.budget_column_id IS 'Monday.com column ID that contains the budget value';
COMMENT ON COLUMN public.board_config.budget_column_type IS 'Type of the budget column (numbers, formula, mirror)';
COMMENT ON COLUMN public.board_config.sync_on_finalize IS 'Automatically sync to monday.com when time entry is finalized';

-- ============================================
-- Board-Specific Role Rate Overrides
-- ============================================

CREATE TABLE IF NOT EXISTS public.board_role_override (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id TEXT NOT NULL,
    role_id UUID NOT NULL REFERENCES public.role(id) ON DELETE CASCADE,
    hourly_rate DECIMAL(10,2) NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE, -- Whether this role is available for this board
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(board_id, role_id)
);

-- Add foreign key constraint after board_config table exists
ALTER TABLE public.board_role_override
DROP CONSTRAINT IF EXISTS board_role_override_board_id_fkey;

ALTER TABLE public.board_role_override
ADD CONSTRAINT board_role_override_board_id_fkey
FOREIGN KEY (board_id) REFERENCES public.board_config(board_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_board_role_override_board ON public.board_role_override(board_id);
CREATE INDEX IF NOT EXISTS idx_board_role_override_role ON public.board_role_override(role_id);

COMMENT ON TABLE public.board_role_override IS 'Board-specific hourly rate overrides for roles (allows different rates per board)';
COMMENT ON COLUMN public.board_role_override.hourly_rate IS 'Override hourly rate for this role on this board';
COMMENT ON COLUMN public.board_role_override.is_enabled IS 'Whether this role is available for time tracking on this board';

-- ============================================
-- Column Sync Configuration
-- ============================================

CREATE TABLE IF NOT EXISTS public.column_sync_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id TEXT NOT NULL,
    
    -- Column identification
    column_id TEXT NOT NULL, -- monday.com column ID
    column_name TEXT NOT NULL, -- Human-readable column name
    column_type TEXT NOT NULL, -- 'numbers', 'text', 'long_text', 'time_tracking'
    
    -- Sync purpose - what data to sync to this column
    sync_purpose TEXT NOT NULL, -- 'total_time', 'time_by_role', 'remaining_budget', 'budget_used'
    
    -- Format settings
    time_format TEXT DEFAULT 'hours', -- 'hours', 'seconds', 'hh:mm'
    include_breakdown BOOLEAN DEFAULT FALSE, -- Include role breakdown in value
    
    sync_enabled BOOLEAN DEFAULT TRUE,
    last_synced_at TIMESTAMPTZ, -- Track last successful sync
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(board_id, column_id)
);

-- Add foreign key constraint
ALTER TABLE public.column_sync_config
DROP CONSTRAINT IF EXISTS column_sync_config_board_id_fkey;

ALTER TABLE public.column_sync_config
ADD CONSTRAINT column_sync_config_board_id_fkey
FOREIGN KEY (board_id) REFERENCES public.board_config(board_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_column_sync_board ON public.column_sync_config(board_id);
CREATE INDEX IF NOT EXISTS idx_column_sync_purpose ON public.column_sync_config(sync_purpose);

COMMENT ON TABLE public.column_sync_config IS 'Maps monday.com columns to sync purposes (total time, time by role, remaining budget)';
COMMENT ON COLUMN public.column_sync_config.column_id IS 'Monday.com column ID to sync data to';
COMMENT ON COLUMN public.column_sync_config.sync_purpose IS 'What data to sync: total_time, time_by_role, remaining_budget, or budget_used';
COMMENT ON COLUMN public.column_sync_config.time_format IS 'How to format time values: hours (decimal), seconds, or hh:mm';

-- Add check constraint for valid sync purposes
ALTER TABLE public.column_sync_config
DROP CONSTRAINT IF EXISTS column_sync_config_purpose_check;

ALTER TABLE public.column_sync_config
ADD CONSTRAINT column_sync_config_purpose_check
CHECK (sync_purpose IN ('total_time', 'time_by_role', 'remaining_budget', 'budget_used'));

-- Add check constraint for valid time formats
ALTER TABLE public.column_sync_config
DROP CONSTRAINT IF EXISTS column_sync_config_time_format_check;

ALTER TABLE public.column_sync_config
ADD CONSTRAINT column_sync_config_time_format_check
CHECK (time_format IN ('hours', 'seconds', 'hh:mm'));

-- ============================================
-- Sync History & Audit Log
-- ============================================

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

CREATE INDEX IF NOT EXISTS idx_sync_log_board_item ON public.sync_log(board_id, item_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON public.sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_success ON public.sync_log(success);

COMMENT ON TABLE public.sync_log IS 'Audit log of all column sync operations for debugging and compliance';
COMMENT ON COLUMN public.sync_log.value_synced IS 'JSON representation of the value that was synced';
COMMENT ON COLUMN public.sync_log.error_message IS 'Error details if the sync operation failed';

-- ============================================
-- Updated At Triggers
-- ============================================

-- Function to update updated_at timestamp (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for board_config
DROP TRIGGER IF EXISTS update_board_config_updated_at ON public.board_config;
CREATE TRIGGER update_board_config_updated_at
    BEFORE UPDATE ON public.board_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for board_role_override
DROP TRIGGER IF EXISTS update_board_role_override_updated_at ON public.board_role_override;
CREATE TRIGGER update_board_role_override_updated_at
    BEFORE UPDATE ON public.board_role_override
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for column_sync_config
DROP TRIGGER IF EXISTS update_column_sync_config_updated_at ON public.column_sync_config;
CREATE TRIGGER update_column_sync_config_updated_at
    BEFORE UPDATE ON public.column_sync_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Helper Functions for Column Sync
-- ============================================

-- Function to get the effective hourly rate for a role on a board
-- Returns board-specific override if exists, otherwise global rate
CREATE OR REPLACE FUNCTION public.get_effective_hourly_rate(
    p_board_id TEXT,
    p_role_id UUID
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_override_rate DECIMAL(10,2);
    v_global_rate DECIMAL(10,2);
BEGIN
    -- Try to get board-specific override
    SELECT hourly_rate INTO v_override_rate
    FROM public.board_role_override
    WHERE board_id = p_board_id 
      AND role_id = p_role_id
      AND is_enabled = TRUE;
    
    IF v_override_rate IS NOT NULL THEN
        RETURN v_override_rate;
    END IF;
    
    -- Fall back to global role rate
    SELECT hourly_rate INTO v_global_rate
    FROM public.role
    WHERE id = p_role_id
      AND is_active = TRUE;
    
    RETURN COALESCE(v_global_rate, 0.00);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_effective_hourly_rate IS 'Returns the effective hourly rate for a role on a board (override or global)';

-- Function to calculate total tracked time for an item by role
CREATE OR REPLACE FUNCTION public.get_item_time_by_role(
    p_item_id TEXT,
    p_user_id UUID DEFAULT NULL -- NULL means all users
)
RETURNS TABLE (
    role_id UUID,
    role_name TEXT,
    total_seconds BIGINT,
    entry_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id AS role_id,
        r.name AS role_name,
        COALESCE(SUM(te.duration), 0)::BIGINT AS total_seconds,
        COUNT(te.id)::BIGINT AS entry_count
    FROM public.role r
    LEFT JOIN public.time_entry te ON te.role = r.id::TEXT
        AND te.item_id = p_item_id
        AND te.is_draft = FALSE
        AND (p_user_id IS NULL OR te.user_id = p_user_id)
    WHERE r.is_active = TRUE
    GROUP BY r.id, r.name
    HAVING COALESCE(SUM(te.duration), 0) > 0
    ORDER BY total_seconds DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_item_time_by_role IS 'Returns total tracked time grouped by role for a monday.com item';

-- Function to calculate total tracked time for an item (all roles combined)
CREATE OR REPLACE FUNCTION public.get_item_total_time(
    p_item_id TEXT,
    p_user_id UUID DEFAULT NULL -- NULL means all users
)
RETURNS BIGINT AS $$
DECLARE
    v_total_seconds BIGINT;
BEGIN
    SELECT COALESCE(SUM(duration), 0)
    INTO v_total_seconds
    FROM public.time_entry
    WHERE item_id = p_item_id
      AND is_draft = FALSE
      AND (p_user_id IS NULL OR user_id = p_user_id);
    
    RETURN v_total_seconds;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.get_item_total_time IS 'Returns total tracked time in seconds for a monday.com item';

-- Function to calculate remaining budget for an item
CREATE OR REPLACE FUNCTION public.calculate_remaining_budget(
    p_board_id TEXT,
    p_item_id TEXT,
    p_budget_amount DECIMAL(10,2),
    p_user_id UUID DEFAULT NULL -- NULL means all users
)
RETURNS TABLE (
    budget_amount DECIMAL(10,2),
    total_cost DECIMAL(10,2),
    remaining_budget DECIMAL(10,2),
    utilization_percent DECIMAL(5,2)
) AS $$
DECLARE
    v_total_cost DECIMAL(10,2) := 0;
    v_role RECORD;
BEGIN
    -- Calculate total cost by summing (time * rate) for each role
    FOR v_role IN 
        SELECT 
            r.id AS role_id,
            COALESCE(SUM(te.duration), 0)::DECIMAL / 3600 AS hours -- Convert seconds to hours
        FROM public.role r
        LEFT JOIN public.time_entry te ON te.role = r.id::TEXT
            AND te.item_id = p_item_id
            AND te.is_draft = FALSE
            AND (p_user_id IS NULL OR te.user_id = p_user_id)
        WHERE r.is_active = TRUE
        GROUP BY r.id
        HAVING COALESCE(SUM(te.duration), 0) > 0
    LOOP
        v_total_cost := v_total_cost + (
            v_role.hours * public.get_effective_hourly_rate(p_board_id, v_role.role_id)
        );
    END LOOP;
    
    budget_amount := p_budget_amount;
    total_cost := v_total_cost;
    remaining_budget := p_budget_amount - v_total_cost;
    
    IF p_budget_amount > 0 THEN
        utilization_percent := (v_total_cost / p_budget_amount) * 100;
    ELSE
        utilization_percent := 0;
    END IF;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.calculate_remaining_budget IS 'Calculates remaining budget based on tracked time and role hourly rates';