-- Migration: Update column_sync_config_purpose_check constraint
-- Add budget_used to the list of allowed sync purposes

ALTER TABLE public.column_sync_config
DROP CONSTRAINT IF EXISTS column_sync_config_purpose_check;

ALTER TABLE public.column_sync_config
ADD CONSTRAINT column_sync_config_purpose_check
CHECK (sync_purpose IN ('total_time', 'time_by_role', 'remaining_budget', 'budget_used'));

COMMENT ON COLUMN public.column_sync_config.sync_purpose IS 'What data to sync: total_time, time_by_role, remaining_budget, or budget_used';
