-- Migration: 008_add_photo_urls_to_users.sql
-- Description: Add photo_urls JSONB column to user_profiles table

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS photo_urls JSONB DEFAULT NULL;

-- Update existing RPC functions to include the new column
-- Note: We will do this in the next step by updating the actual function files if they exist, 
-- but for the migration record, we'll include the updated definitions here as well.
