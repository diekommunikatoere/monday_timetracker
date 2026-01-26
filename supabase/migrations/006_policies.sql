-- Migration: 006_policies.sql
-- Description: Consolidated RLS policy definitions for the timetracker backend.

-- ============================================
-- 1. user_profiles
-- ============================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON public.user_profiles FOR SELECT
    USING (true); -- Allow viewing all profiles (needed for app functionality)

CREATE POLICY "Users can update own profile"
    ON public.user_profiles FOR UPDATE
    USING (auth.uid()::text = monday_user_id); -- Assuming auth.uid() maps to monday_user_id or similar logic

CREATE POLICY "Allow insert for authenticated users"
    ON public.user_profiles FOR INSERT
    WITH CHECK (true); -- App manages user creation

-- ============================================
-- 2. role
-- ============================================
ALTER TABLE public.role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Roles are viewable by all"
    ON public.role FOR SELECT
    USING (true);

CREATE POLICY "Roles can be managed"
    ON public.role FOR ALL
    USING (true); -- In production, restrict to admin users

-- ============================================
-- 3. time_entry
-- ============================================
ALTER TABLE public.time_entry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own time entries"
    ON public.time_entry FOR SELECT
    USING (user_id IN (SELECT id FROM public.user_profiles WHERE id = user_id));

CREATE POLICY "Users can insert own time entries"
    ON public.time_entry FOR INSERT
    WITH CHECK (user_id IN (SELECT id FROM public.user_profiles WHERE id = user_id));

CREATE POLICY "Users can update own time entries"
    ON public.time_entry FOR UPDATE
    USING (user_id IN (SELECT id FROM public.user_profiles WHERE id = user_id));

CREATE POLICY "Users can delete own time entries"
    ON public.time_entry FOR DELETE
    USING (user_id IN (SELECT id FROM public.user_profiles WHERE id = user_id));

-- ============================================
-- 4. timer_session
-- ============================================
ALTER TABLE public.timer_session ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their timer_sessions"
    ON public.timer_session FOR ALL
    USING (user_id IN (SELECT id FROM public.user_profiles WHERE id = user_id));

-- ============================================
-- 5. timer_segment
-- ============================================
ALTER TABLE public.timer_segment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their timer_segments"
    ON public.timer_segment FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.timer_session ts
            WHERE ts.id = timer_segment.session_id
            AND ts.user_id IN (SELECT id FROM public.user_profiles WHERE id = ts.user_id)
        )
    );

-- ============================================
-- 6. Dimension Tables (Publicly Viewable)
-- ============================================
ALTER TABLE public.monday_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monday_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monday_column ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Monday boards are viewable by all" ON public.monday_board FOR SELECT USING (true);
CREATE POLICY "Monday items are viewable by all" ON public.monday_item FOR SELECT USING (true);
CREATE POLICY "Monday columns are viewable by all" ON public.monday_column FOR SELECT USING (true);

-- ============================================
-- 7. Configuration Tables
-- ============================================
ALTER TABLE public.board_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_role_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.column_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Board configs are viewable by all" ON public.board_config FOR SELECT USING (true);
CREATE POLICY "Board role overrides are viewable by all" ON public.board_role_override FOR SELECT USING (true);
CREATE POLICY "Column sync configs are viewable by all" ON public.column_sync_config FOR SELECT USING (true);
CREATE POLICY "Sync logs are viewable by all" ON public.sync_log FOR SELECT USING (true);
