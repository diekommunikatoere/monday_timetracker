-- Migration 006: Add Display Names to Time Entries
-- Adds human-readable name fields alongside existing ID fields
-- This allows displaying names in the UI while keeping IDs for data integrity

-- Add display name columns to time_entry table
ALTER TABLE public.time_entry
ADD COLUMN board_name TEXT,
ADD COLUMN item_name TEXT,
ADD COLUMN role_name TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.time_entry.board_name IS 'Human-readable board name for display purposes';
COMMENT ON COLUMN public.time_entry.item_name IS 'Human-readable task/item name for display purposes';
COMMENT ON COLUMN public.time_entry.role_name IS 'Human-readable role name for display purposes';
