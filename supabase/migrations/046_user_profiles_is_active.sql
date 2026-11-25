-- Migration: 046_user_profiles_is_active.sql
-- Description: Add reporting/assignment active flag to user_profiles.

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
