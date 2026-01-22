-- Migration: Add linked_board_id and sync_linked_items to board_config
-- Support for recursive synchronization of linked items

ALTER TABLE public.board_config 
ADD COLUMN IF NOT EXISTS linked_board_id TEXT,
ADD COLUMN IF NOT EXISTS sync_linked_items BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.board_config.linked_board_id IS 'Board ID to search for linked items when syncing';
COMMENT ON COLUMN public.board_config.sync_linked_items IS 'Whether to trigger sync for linked items on the linked_board_id';
