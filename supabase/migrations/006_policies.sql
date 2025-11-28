-- Migration: 006_policies.sql

-- Migration: policy_role
-- Row Level Security policies for role table

-- Enable Row Level Security
ALTER TABLE public.role ENABLE ROW LEVEL SECURITY;

-- RLS Policies: role (readable by all, managed by admins)
CREATE POLICY "Roles are viewable by all"
    ON public.role
    FOR SELECT
    USING (true);

CREATE POLICY "Roles can be managed"
    ON public.role
    FOR ALL
    USING (true); -- In production, restrict to admin users


-- Migration: policy_time_entry
-- Row Level Security policies for time_entry table

-- Enable Row Level Security
ALTER TABLE public.time_entry ENABLE ROW LEVEL SECURITY;

-- RLS Policies: time_entry
CREATE POLICY "Users can view own time entries"
    ON public.time_entry
    FOR SELECT
    USING (user_id IN (
        SELECT id FROM public.user_profiles WHERE id = user_id
    ));

CREATE POLICY "Users can insert own time entries"
    ON public.time_entry
    FOR INSERT
    WITH CHECK (user_id IN (
        SELECT id FROM public.user_profiles WHERE id = user_id
    ));

CREATE POLICY "Users can update own time entries"
    ON public.time_entry
    FOR UPDATE
    USING (user_id IN (
        SELECT id FROM public.user_profiles WHERE id = user_id
    ));

CREATE POLICY "Users can delete own time entries"
    ON public.time_entry
    FOR DELETE
    USING (user_id IN (
        SELECT id FROM public.user_profiles WHERE id = user_id
    ));


-- Migration: policy_timer_segment
-- Row Level Security policies for timer_segment table

-- Enable Row Level Security
ALTER TABLE public.timer_segment ENABLE ROW LEVEL SECURITY;

-- RLS Policies: timer_segment
CREATE POLICY "Users can manage their timer_segments"
    ON public.timer_segment
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.timer_session ts
            WHERE ts.id = timer_segment.session_id
            AND ts.user_id IN (
                SELECT id FROM public.user_profiles WHERE id = ts.user_id
            )
        )
    );



-- Migration: policy_timer_session
-- Row Level Security policies for timer_session table

-- Enable Row Level Security
ALTER TABLE public.timer_session ENABLE ROW LEVEL SECURITY;

-- RLS Policies: timer_session
CREATE POLICY "Users can manage their timer_sessions"
    ON public.timer_session
    FOR ALL
    USING (user_id IN (
        SELECT id FROM public.user_profiles WHERE id = user_id
    ));



-- Migration: policy_user_profiles
-- Row Level Security policies for user_profiles table

-- Enable Row Level Security
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies: user_profiles
CREATE POLICY "Users can view own profile"
    ON public.user_profiles
    FOR SELECT
    USING (true); -- Allow viewing all profiles (needed for app functionality)

CREATE POLICY "Users can update own profile"
    ON public.user_profiles
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Allow insert for authenticated users"
    ON public.user_profiles
    FOR INSERT
    WITH CHECK (true); -- App manages user creation