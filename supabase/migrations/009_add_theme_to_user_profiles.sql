-- Migration: 009_add_theme_to_user_profiles.sql
-- Description: Add theme column to user_profiles table to persist user theme preference.

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS theme TEXT;
