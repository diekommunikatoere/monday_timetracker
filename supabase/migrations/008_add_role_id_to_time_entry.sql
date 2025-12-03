-- Migration: Add role_id column to time_entry table
-- Adds a foreign key relationship to the role table for proper data integrity

-- Add role_id column as UUID foreign key to role table
ALTER TABLE public.time_entry
ADD COLUMN role_id UUID REFERENCES public.role(id) ON DELETE SET NULL;

-- Add index for performance on foreign key
CREATE INDEX idx_time_entry_role_id ON public.time_entry(role_id);

-- Add comment for documentation
COMMENT ON COLUMN public.time_entry.role_id IS 'Foreign key to role table - primary source of truth for role association';