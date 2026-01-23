-- Migration: 019_normalize_time_entry.sql
-- Description: Normalizes the time_entry table by removing redundant text columns and adding FKs to dimension tables.
-- Part of Phase 2 & 4 of the ID-based storage plan.

-- 1. Backfill Dimensions (Ensuring latest names are preserved)

-- Backfill boards from board_config (primary source for configured boards)
INSERT INTO public.monday_board (id, name)
SELECT board_id, board_name
FROM public.board_config
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

-- Backfill boards from time_entry (for historical boards not in config)
INSERT INTO public.monday_board (id, name)
SELECT DISTINCT ON (board_id) board_id, board_name
FROM public.time_entry
WHERE board_id IS NOT NULL AND board_name IS NOT NULL
ORDER BY board_id, updated_at DESC
ON CONFLICT (id) DO NOTHING;

-- Backfill items from time_entry (including parent items)
-- First, parent items
INSERT INTO public.monday_item (id, name, board_id)
SELECT DISTINCT ON (parent_item_id) parent_item_id, parent_item_name, board_id
FROM public.time_entry
WHERE parent_item_id IS NOT NULL AND parent_item_name IS NOT NULL AND board_id IS NOT NULL
ORDER BY parent_item_id, updated_at DESC
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, board_id = EXCLUDED.board_id, updated_at = NOW();

-- Then, items
INSERT INTO public.monday_item (id, name, board_id, parent_item_id)
SELECT DISTINCT ON (item_id) item_id, item_name, board_id, parent_item_id
FROM public.time_entry
WHERE item_id IS NOT NULL AND item_name IS NOT NULL AND board_id IS NOT NULL
ORDER BY item_id, updated_at DESC
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, board_id = EXCLUDED.board_id, parent_item_id = EXCLUDED.parent_item_id, updated_at = NOW();

-- 2. Update RPC Functions to use JOINs

-- Update get_user_time_entries
CREATE OR REPLACE FUNCTION get_user_time_entries(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    task_name TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration INTEGER,
    board_id TEXT,
    board_name TEXT,
    item_id TEXT,
    item_name TEXT,
    parent_item_id TEXT,
    parent_item_name TEXT,
    role_id UUID,
    comment TEXT,
    is_draft BOOLEAN,
    synced_to_monday BOOLEAN,
    timer_session JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        te.id,
        te.user_id,
        COALESCE(mi.name, 'Unbenannter Zeiteintrag') as task_name,
        te.start_time,
        te.end_time,
        te.duration,
        te.board_id,
        mb.name as board_name,
        te.item_id,
        mi.name as item_name,
        te.parent_item_id,
        mpi.name as parent_item_name,
        te.role_id,
        te.comment,
        te.is_draft,
        te.synced_to_monday,
        te.timer_session,
        te.created_at,
        te.updated_at
    FROM time_entry te
    LEFT JOIN monday_board mb ON te.board_id = mb.id
    LEFT JOIN monday_item mi ON te.item_id = mi.id
    LEFT JOIN monday_item mpi ON te.parent_item_id = mpi.id
    WHERE te.user_id = p_user_id
    AND te.deleted_at IS NULL
    ORDER BY te.start_time DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update finalize_draft (removing name parameters from SET, but keeping them in signature for compatibility if needed, or cleaning up)
-- We'll keep the signature but ignore the name params for the update, instead we should update the dimension tables if names are provided.

CREATE OR REPLACE FUNCTION finalize_time_entry(
    p_user_id UUID,
    p_draft_id UUID,
    p_task_name TEXT,
    p_comment TEXT,
    p_board_id TEXT DEFAULT NULL,
    p_item_id TEXT DEFAULT NULL,
    p_role_id UUID DEFAULT NULL,
    p_board_name TEXT DEFAULT NULL,
    p_item_name TEXT DEFAULT NULL,
    p_duration INTEGER DEFAULT NULL,
    p_parent_item_id TEXT DEFAULT NULL,
    p_parent_item_name TEXT DEFAULT NULL,
    p_date TIMESTAMPTZ DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
  v_end_time timestamptz;
  v_start_time timestamptz;
  v_duration integer;
BEGIN
  -- 1. Update dimension tables if names are provided
  IF p_board_id IS NOT NULL AND p_board_name IS NOT NULL THEN
    INSERT INTO public.monday_board (id, name)
    VALUES (p_board_id, p_board_name)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();
  END IF;

  IF p_item_id IS NOT NULL AND p_item_name IS NOT NULL THEN
    INSERT INTO public.monday_item (id, name, board_id, parent_item_id)
    VALUES (p_item_id, p_item_name, p_board_id, p_parent_item_id)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, board_id = EXCLUDED.board_id, parent_item_id = EXCLUDED.parent_item_id, updated_at = NOW();
  END IF;

  IF p_parent_item_id IS NOT NULL AND p_parent_item_name IS NOT NULL THEN
    INSERT INTO public.monday_item (id, name, board_id)
    VALUES (p_parent_item_id, p_parent_item_name, p_board_id)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, board_id = EXCLUDED.board_id, updated_at = NOW();
  END IF;

  -- 2. Calculate times
  IF p_date IS NOT NULL THEN
    v_start_time := p_date;
  ELSE
    SELECT start_time INTO v_start_time FROM time_entry WHERE id = p_draft_id;
  END IF;

  IF p_duration IS NOT NULL THEN
    v_duration := p_duration;
    v_end_time := v_start_time + (v_duration || ' seconds')::interval;
  ELSE
    v_end_time := now();
    v_duration := extract(epoch from (v_end_time - v_start_time))::integer;
  END IF;

  -- 3. Update time entry
  UPDATE time_entry
  SET
    start_time = v_start_time,
    end_time = v_end_time,
    duration = v_duration,
    comment = p_comment,
    board_id = p_board_id,
    item_id = p_item_id,
    role_id = p_role_id,
    parent_item_id = p_parent_item_id,
    is_draft = false,
    updated_at = now()
  WHERE id = p_draft_id AND user_id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Add Foreign Key Constraints to time_entry

ALTER TABLE public.time_entry
ADD CONSTRAINT fk_time_entry_board FOREIGN KEY (board_id) REFERENCES public.monday_board(id) ON DELETE SET NULL,
ADD CONSTRAINT fk_time_entry_item FOREIGN KEY (item_id) REFERENCES public.monday_item(id) ON DELETE SET NULL;

-- 4. Drop Redundant Columns

ALTER TABLE public.time_entry
DROP COLUMN IF EXISTS board_name,
DROP COLUMN IF EXISTS item_name,
DROP COLUMN IF EXISTS parent_item_name,
DROP COLUMN IF EXISTS task_name;

-- 5. Update board_config to remove board_name (it's now in monday_board)
-- Note: board_config.board_id is already UNIQUE and used as PK in monday_board.
-- We keep board_config but it should eventually join with monday_board for the name.

ALTER TABLE public.board_config
DROP COLUMN IF EXISTS board_name;
