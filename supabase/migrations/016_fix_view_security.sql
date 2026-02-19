-- Migration: 016_fix_view_security.sql
-- Description: Fix security_definer_view lint error on view_monday_tasks
--   by recreating the view with SECURITY INVOKER so it respects the
--   querying user's RLS policies rather than the view owner's.

-- 1. Drop existing view
DROP VIEW IF EXISTS public.view_monday_tasks;

-- 2. Recreate with security_invoker = true (PostgreSQL 15+)
CREATE VIEW public.view_monday_tasks
WITH (security_invoker = true)
AS
SELECT 
    i.id,
    i.name,
    COALESCE(p.board_id, i.board_id) as board_id,
    i.parent_item_id,
    p.name AS parent_item_name,
    COALESCE(i.group_id, p.group_id) AS group_id,
    i.is_active,
    i.updated_at
FROM public.monday_item i
LEFT JOIN public.monday_item p ON i.parent_item_id = p.id;

-- 3. Restore comment
COMMENT ON VIEW public.view_monday_tasks IS 
    'View that resolves group_id for subitems by inheriting from their parent item, 
     and includes parent_item_name for subitems. 
     Use this view instead of monday_item when filtering by group_id to ensure subitems are included.';