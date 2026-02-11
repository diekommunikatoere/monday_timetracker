-- Migration: 012_monday_group_and_item_updates.sql
-- Description: Add monday_group table for group sync control, update monday_board and monday_item tables
-- Phase 1 of webhook-first architecture for task item selector optimization

-- ============================================
-- 1. Create monday_group table
-- ============================================

CREATE TABLE IF NOT EXISTS public.monday_group (
    id TEXT NOT NULL,
    board_id TEXT NOT NULL REFERENCES public.monday_board(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position TEXT,
    sync_enabled BOOLEAN NOT NULL DEFAULT true,
    color TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (board_id, id)
);

-- ============================================
-- 2. Add indexes for monday_group
-- ============================================

CREATE INDEX IF NOT EXISTS idx_monday_group_board ON public.monday_group(board_id);
CREATE INDEX IF NOT EXISTS idx_monday_group_sync ON public.monday_group(board_id, sync_enabled);

-- ============================================
-- 3. Alter monday_board table
-- ============================================

-- Add workspace_id for multi-workspace support and archive board handling
ALTER TABLE public.monday_board
ADD COLUMN IF NOT EXISTS workspace_id TEXT;

-- Add board_kind for filtering ('public', 'private', 'share')
ALTER TABLE public.monday_board
ADD COLUMN IF NOT EXISTS board_kind TEXT;

-- Add state for filtering ('active', 'archived', 'deleted')
ALTER TABLE public.monday_board
ADD COLUMN IF NOT EXISTS state TEXT;

-- ============================================
-- 4. Alter monday_item table
-- ============================================

-- Add group_id for group-based filtering
ALTER TABLE public.monday_item
ADD COLUMN IF NOT EXISTS group_id TEXT;

-- Add is_active flag for soft-delete of archived/deleted items
ALTER TABLE public.monday_item
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ============================================
-- 5. Add indexes for monday_item
-- ============================================

CREATE INDEX IF NOT EXISTS idx_monday_item_board_group ON public.monday_item(board_id, group_id);
CREATE INDEX IF NOT EXISTS idx_monday_item_active ON public.monday_item(board_id, is_active);

-- ============================================
-- 6. Add foreign key constraint for group_id (optional - groups may not exist yet)
-- ============================================

-- Note: We don't add a strict FK here because groups can be deleted/created dynamically
-- The application handles referential integrity via upserts

-- ============================================
-- 7. Enable RLS on monday_group
-- ============================================

ALTER TABLE public.monday_group ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. RLS Policies for monday_group
-- ============================================

-- Allow read access to authenticated users
CREATE POLICY "Allow read access to monday_group for authenticated users"
ON public.monday_group
FOR SELECT
TO authenticated
USING (true);

-- Allow insert/update/delete for service role (webhooks, admin operations)
CREATE POLICY "Allow full access to monday_group for service role"
ON public.monday_group
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- 9. Update trigger for monday_group updated_at
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for monday_group if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_monday_group_updated_at'
        AND tgrelid = 'public.monday_group'::regclass
    ) THEN
        CREATE TRIGGER update_monday_group_updated_at
        BEFORE UPDATE ON public.monday_group
        FOR EACH ROW
        EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- ============================================
-- 10. Comments for documentation
-- ============================================

COMMENT ON TABLE public.monday_group IS 'Groups within Monday.com boards with sync control for task selector';
COMMENT ON COLUMN public.monday_group.sync_enabled IS 'When false, items in this group are excluded from the task selector';
COMMENT ON COLUMN public.monday_board.workspace_id IS 'Monday.com workspace ID for multi-workspace support';
COMMENT ON COLUMN public.monday_board.board_kind IS 'Board visibility: public, private, or share';
COMMENT ON COLUMN public.monday_board.state IS 'Board state: active, archived, or deleted';
COMMENT ON COLUMN public.monday_item.group_id IS 'Reference to monday_group.id for group-based filtering';
COMMENT ON COLUMN public.monday_item.is_active IS 'False when item is archived or deleted via webhook';
