-- Migration: Add sync_budget_used to board_config
-- Support for syncing total expenditure (Total Cost) to a separate column

ALTER TABLE public.board_config 
ADD COLUMN IF NOT EXISTS sync_budget_used BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.board_config.sync_budget_used IS 'Whether to sync the total expenditure (Total Cost) to a separate column';
