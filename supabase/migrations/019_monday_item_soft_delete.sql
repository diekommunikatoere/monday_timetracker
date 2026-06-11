-- Migration: 019_monday_item_soft_delete.sql
-- Description: Add deleted_at to monday_item so item deletion (Monday "trash") is a
--   soft-delete. Monday keeps trashed items restorable for 30 days, so we must not
--   hard-delete the row (time_entry.item_id is ON DELETE SET NULL, which would orphan
--   tracked time). deleted_at is the single source of truth for "trashed":
--     active   -> is_active = true,  deleted_at IS NULL
--     archived -> is_active = false, deleted_at IS NULL
--     trashed  -> is_active = false, deleted_at IS NOT NULL
--   Time entries on trashed items are excluded from overviews/budgets (migration 020),
--   and a purge removes trashed items + their time entries after 31 days.

-- ============================================
-- 1. Add deleted_at column
-- ============================================

ALTER TABLE public.monday_item
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.monday_item.deleted_at IS
    'When the item was trashed in Monday (soft-delete). NULL for active/archived items. '
    'Trashed items and their time entries are purged after 31 days.';

-- Partial index for the purge sweep and trashed-item exclusion in aggregations.
CREATE INDEX IF NOT EXISTS idx_monday_item_deleted_at
    ON public.monday_item(deleted_at)
    WHERE deleted_at IS NOT NULL;
