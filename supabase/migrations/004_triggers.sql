-- Migration: 004_triggers.sql
-- All triggers (lexical order)
-- Migration: trigger_role_update_role_updated_at
-- Trigger for role.updated_at auto-update

DROP TRIGGER IF EXISTS update_role_updated_at ON public.role;
CREATE TRIGGER update_role_updated_at
    BEFORE UPDATE ON public.role
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();-- Migration: trigger_time_entry_update_time_entry_updated_at
-- Trigger for time_entry.updated_at auto-update

DROP TRIGGER IF EXISTS update_time_entry_updated_at ON public.time_entry;
CREATE TRIGGER update_time_entry_updated_at
    BEFORE UPDATE ON public.time_entry
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();-- Migration: trigger_timer_session_update_timer_session_updated_at
-- Trigger for timer_session.updated_at auto-update

DROP TRIGGER IF EXISTS update_timer_session_updated_at ON public.timer_session;
CREATE TRIGGER update_timer_session_updated_at
    BEFORE UPDATE ON public.timer_session
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();-- Migration: trigger_user_profiles_update_user_profiles_updated_at
-- Trigger for user_profiles.updated_at auto-update

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();