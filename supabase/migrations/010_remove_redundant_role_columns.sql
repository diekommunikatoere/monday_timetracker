-- Migration: Remove redundant role and role_name columns
-- After adding role_id foreign key, these columns are no longer needed
-- Role information should be fetched via JOIN with the role table

-- Drop the redundant role column (was storing role name as text)
ALTER TABLE public.time_entry DROP COLUMN IF EXISTS role;

-- Drop the redundant role_name column (duplicate of role)
ALTER TABLE public.time_entry DROP COLUMN IF EXISTS role_name;

-- Add comment to document the change
COMMENT ON COLUMN public.time_entry.role_id IS 'Foreign key to role table - use JOIN to get role name and other attributes';