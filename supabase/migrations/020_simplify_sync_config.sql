-- Migration: Simplify Sync Configuration Model
-- Refactor board_config and column_sync_config to simplify the Admin UX

-- 1. board_config cleanup: Remove redundant fields
ALTER TABLE public.board_config
DROP COLUMN IF EXISTS sync_total_time,
DROP COLUMN IF EXISTS sync_time_by_role,
DROP COLUMN IF EXISTS sync_remaining_budget,
DROP COLUMN IF EXISTS currency_symbol;

-- 2. Update column_sync_config
-- We keep the columns but they will be ignored/hidden in the UI
-- Ensure sync_purpose defaults to 'budget_used' for new entries if not specified
ALTER TABLE public.column_sync_config
ALTER COLUMN sync_purpose SET DEFAULT 'budget_used';

-- Note: we don't drop time_format and include_breakdown yet to avoid breaking existing data
-- even if we ignore them in the new UI.

COMMENT ON TABLE public.board_config IS 'Simplified board-level configuration for time tracking sync and budget settings';
COMMENT ON COLUMN public.board_config.sync_budget_used IS 'Whether to sync the total expenditure (Total Cost) to the configured column';
