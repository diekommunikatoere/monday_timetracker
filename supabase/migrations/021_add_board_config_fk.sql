-- Migration: 021_add_board_config_fk.sql
-- Description: Adds a foreign key constraint between board_config and monday_board to enable Supabase joins.

-- Ensure all board_ids in board_config exist in monday_board before adding the constraint
-- This is a safety measure to prevent the migration from failing if there are orphaned configs.
INSERT INTO public.monday_board (id, name)
SELECT DISTINCT board_id, 'Unknown Board'
FROM public.board_config
ON CONFLICT (id) DO NOTHING;

-- Add the foreign key constraint
ALTER TABLE public.board_config
ADD CONSTRAINT fk_board_config_monday_board
FOREIGN KEY (board_id) REFERENCES public.monday_board(id) ON DELETE CASCADE;

-- Add comment for documentation
COMMENT ON CONSTRAINT fk_board_config_monday_board ON public.board_config IS 'Links board configuration to the cached Monday.com board metadata';
