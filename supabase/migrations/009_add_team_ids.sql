-- Add team_ids column to user_profiles table
ALTER TABLE public.user_profiles
ADD COLUMN team_ids text[] DEFAULT NULL;

COMMENT ON COLUMN public.user_profiles.team_ids IS 'Array of Monday.com team IDs the user belongs to';
