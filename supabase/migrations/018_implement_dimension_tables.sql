-- Migration: 018_implement_dimension_tables.sql
-- Description: Implements dimension tables for Monday.com metadata (boards, items, columns)
-- Part of Phase 1 of the ID-based storage plan.

-- 1. Create Tables

-- monday_board: Caches board names
CREATE TABLE IF NOT EXISTS public.monday_board (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- monday_item: Caches item names, board IDs, and hierarchy
CREATE TABLE IF NOT EXISTS public.monday_item (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    board_id TEXT NOT NULL,
    parent_item_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- monday_column: Caches board column metadata (ID, title, type)
CREATE TABLE IF NOT EXISTS public.monday_column (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id TEXT NOT NULL REFERENCES public.monday_board(id) ON DELETE CASCADE,
    monday_column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(board_id, monday_column_id)
);

-- 2. Enable Row Level Security

ALTER TABLE public.monday_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monday_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monday_column ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies (Viewable by all authenticated users)

CREATE POLICY "Monday boards are viewable by all"
    ON public.monday_board FOR SELECT
    USING (true);

CREATE POLICY "Monday items are viewable by all"
    ON public.monday_item FOR SELECT
    USING (true);

CREATE POLICY "Monday columns are viewable by all"
    ON public.monday_column FOR SELECT
    USING (true);

-- 4. Create Indexes

CREATE INDEX IF NOT EXISTS idx_monday_item_board_id ON public.monday_item(board_id);
CREATE INDEX IF NOT EXISTS idx_monday_item_parent_item_id ON public.monday_item(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_monday_column_board_id ON public.monday_column(board_id);

-- 5. Backfill Data from time_entry

-- Backfill boards
INSERT INTO public.monday_board (id, name)
SELECT DISTINCT board_id, board_name
FROM public.time_entry
WHERE board_id IS NOT NULL AND board_name IS NOT NULL
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();

-- Backfill parent items first (so they can be referenced if needed, though no FK yet)
INSERT INTO public.monday_item (id, name, board_id)
SELECT DISTINCT parent_item_id, parent_item_name, board_id
FROM public.time_entry
WHERE parent_item_id IS NOT NULL AND parent_item_name IS NOT NULL AND board_id IS NOT NULL
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, board_id = EXCLUDED.board_id, updated_at = NOW();

-- Backfill items
INSERT INTO public.monday_item (id, name, board_id, parent_item_id)
SELECT DISTINCT item_id, item_name, board_id, parent_item_id
FROM public.time_entry
WHERE item_id IS NOT NULL AND item_name IS NOT NULL AND board_id IS NOT NULL
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, board_id = EXCLUDED.board_id, parent_item_id = EXCLUDED.parent_item_id, updated_at = NOW();

-- 6. Add Comments

COMMENT ON TABLE public.monday_board IS 'Caches Monday.com board names';
COMMENT ON TABLE public.monday_item IS 'Caches Monday.com item names and hierarchy';
COMMENT ON TABLE public.monday_column IS 'Caches Monday.com board column metadata';
