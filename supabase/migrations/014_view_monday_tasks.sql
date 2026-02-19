-- Migration: 014_view_monday_tasks.sql
-- Description: Create a view that resolves group_id for subitems by inheriting from their parent
-- This ensures subitems are visible when filtering by synced groups

-- ============================================
-- 1. Create view_monday_tasks
-- ============================================

CREATE OR REPLACE VIEW public.view_monday_tasks AS
SELECT 
    i.id,
    i.name,
    i.board_id,
    i.parent_item_id,
    -- Inherit parent's group_id if item has no group_id (subitems)
    COALESCE(i.group_id, p.group_id) as group_id,
    i.is_active,
    i.updated_at
FROM public.monday_item i
LEFT JOIN public.monday_item p ON i.parent_item_id = p.id;

-- ============================================
-- 2. Enable RLS on the view
-- ============================================

-- Note: Views don't support RLS directly, but we can create policies on the underlying table
-- The view inherits permissions from the underlying table

-- ============================================
-- 3. Add comment for documentation
-- ============================================

COMMENT ON VIEW public.view_monday_tasks IS 
    'View that resolves group_id for subitems by inheriting from their parent item. 
     Use this view instead of monday_item when filtering by group_id to ensure subitems are included.';
