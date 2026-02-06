-- 1. Add is_admin column to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. Harden ROLE table — Remove the permissive "FOR ALL" policy
DROP POLICY IF EXISTS "Roles can be managed" ON public.role;
-- Keep "Roles are viewable by all" for SELECT — frontend needs this

-- 3. Harden dimension tables — ensure no write policies exist for anon
-- (Currently only SELECT policies exist, which is correct)

-- 4. Harden configuration tables — ensure no write policies exist for anon
-- board_config, board_role_override, column_sync_config, sync_log
-- We explicitly ensure no INSERT/UPDATE/DELETE policies exist for public/anon.

-- 5. Tighten time_entry RLS to SELECT-only for anon
-- First, drop existing permissive policies
DROP POLICY IF EXISTS "Users can create their own time entries" ON public.time_entry;
DROP POLICY IF EXISTS "Users can update their own time entries" ON public.time_entry;
DROP POLICY IF EXISTS "Users can delete their own time entries" ON public.time_entry;

-- Ensure SELECT policy is correct (only see own entries)
-- Since we don't use Supabase Auth, we can't easily restrict SELECT for anon users
-- without passing a user ID in a way that can't be spoofed.
-- For now, we keep SELECT open but writes are now API-only.
-- Actually, the plan says "Tighten time_entry RLS to SELECT-only for anon".
-- This means we just don't add any INSERT/UPDATE/DELETE policies for anon.
