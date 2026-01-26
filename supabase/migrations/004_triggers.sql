-- Migration: 004_triggers.sql
-- Description: Consolidated trigger definitions for the timetracker backend.

-- ============================================
-- 1. updated_at Auto-Update Trigger
-- ============================================

-- Trigger for user_profiles
DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for role
DROP TRIGGER IF EXISTS update_role_updated_at ON public.role;
CREATE TRIGGER update_role_updated_at
    BEFORE UPDATE ON public.role
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for time_entry
DROP TRIGGER IF EXISTS update_time_entry_updated_at ON public.time_entry;
CREATE TRIGGER update_time_entry_updated_at
    BEFORE UPDATE ON public.time_entry
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for timer_session
DROP TRIGGER IF EXISTS update_timer_session_updated_at ON public.timer_session;
CREATE TRIGGER update_timer_session_updated_at
    BEFORE UPDATE ON public.timer_session
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for board_config
DROP TRIGGER IF EXISTS update_board_config_updated_at ON public.board_config;
CREATE TRIGGER update_board_config_updated_at
    BEFORE UPDATE ON public.board_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for board_role_override
DROP TRIGGER IF EXISTS update_board_role_override_updated_at ON public.board_role_override;
CREATE TRIGGER update_board_role_override_updated_at
    BEFORE UPDATE ON public.board_role_override
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for column_sync_config
DROP TRIGGER IF EXISTS update_column_sync_config_updated_at ON public.column_sync_config;
CREATE TRIGGER update_column_sync_config_updated_at
    BEFORE UPDATE ON public.column_sync_config
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for monday_board
DROP TRIGGER IF EXISTS update_monday_board_updated_at ON public.monday_board;
CREATE TRIGGER update_monday_board_updated_at
    BEFORE UPDATE ON public.monday_board
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for monday_item
DROP TRIGGER IF EXISTS update_monday_item_updated_at ON public.monday_item;
CREATE TRIGGER update_monday_item_updated_at
    BEFORE UPDATE ON public.monday_item
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for monday_column
DROP TRIGGER IF EXISTS update_monday_column_updated_at ON public.monday_column;
CREATE TRIGGER update_monday_column_updated_at
    BEFORE UPDATE ON public.monday_column
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
