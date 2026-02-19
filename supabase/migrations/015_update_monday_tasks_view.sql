-- Migration: 015_update_monday_tasks_view.sql
-- Description: Update view_monday_tasks to include parent_item_name for simplified task fetching
-- This allows fetching both parent items and subitems with their parent names in a single query

-- ============================================
-- 1. Drop existing view (required to change column order)
-- ============================================

DROP VIEW IF EXISTS public.view_monday_tasks;

-- ============================================
-- 2. Recreate view_monday_tasks with parent_item_name
-- ============================================

CREATE VIEW public.view_monday_tasks AS
SELECT 
    i.id,
    i.name,
    COALESCE(p.board_id, i.board_id) as board_id,
    i.parent_item_id,
    p.name as parent_item_name,
    COALESCE(i.group_id, p.group_id) as group_id,
    i.is_active,
    i.updated_at
FROM public.monday_item i
LEFT JOIN public.monday_item p ON i.parent_item_id = p.id;

-- ============================================
-- 3. Add comment for documentation
-- ============================================

COMMENT ON VIEW public.view_monday_tasks IS 
    'View that resolves group_id for subitems by inheriting from their parent item, 
     and includes parent_item_name for subitems. 
     Use this view instead of monday_item when filtering by group_id to ensure subitems are included.';
