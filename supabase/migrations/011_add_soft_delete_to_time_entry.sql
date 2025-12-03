-- Migration: 011_add_soft_delete_to_time_entry
-- Adds soft-delete support to time_entry table
-- Allows entries to be marked as deleted with undo functionality

-- Add soft-delete columns to time_entry table
ALTER TABLE public.time_entry 
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN deleted_by VARCHAR(255) DEFAULT NULL;

-- Add index for efficient filtering of deleted entries
CREATE INDEX idx_time_entry_deleted_at ON public.time_entry(deleted_at) 
WHERE deleted_at IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.time_entry.deleted_at IS 'Timestamp when entry was soft-deleted (NULL if not deleted)';
COMMENT ON COLUMN public.time_entry.deleted_by IS 'User ID who deleted the entry (NULL if not deleted)';
