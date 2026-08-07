-- Migration: 042_indexes_for_performance_improvements.sql
-- Description: Indexes and foreign keys from a schema review — closes gaps where an
--   FK-referencing column has no supporting index (slow ON DELETE SET NULL checks),
--   adds an index for a hot analytics query path that the existing composite index
--   can't serve, and adds FK constraints monday_item is missing relative to every
--   sibling monday-cache table. Also fixes time_entry.deleted_by's type.

-- ============================================
-- 1. monday_item indexes
-- ============================================

-- idx_monday_item_group_id: the existing (board_id, group_id) composite
-- (012_monday_group_and_item_updates.sql) can't serve a group_id-only lookup since
-- group_id isn't the leading column.
CREATE INDEX IF NOT EXISTS idx_monday_item_group_id ON public.monday_item(group_id);

-- Not carried over from the original draft of this migration:
-- - idx_monday_item_is_active (standalone): every call site (lib/database.ts's
--   getTasksFromDB) filters is_active together with board_id, which the existing
--   idx_monday_item_active(board_id, is_active) composite already serves as a
--   leading-column match — a standalone index adds nothing for that shape, and
--   is_active is low-cardinality (mostly true) so it wouldn't be very selective
--   even for an is_active-only query.
-- - idx_monday_item_name: no query in the codebase filters or sorts by
--   monday_item.name server-side today (task lists sort client-side after fetch).
--   Re-add if a name-search/sort feature lands — pair with pg_trgm + a GIN index
--   instead of plain btree if it needs ILIKE '%...%' rather than just ORDER BY /
--   exact match.

-- ============================================
-- 2. sync_log: index the FK columns (ON DELETE SET NULL checks were unindexed)
-- ============================================
-- sync_log has no purge/retention job (unlike time_entry/monday_item, which are
-- soft-deleted and swept) — it grows without bound. Every hard delete of a
-- time_entry (the cleanup cron draining Redis hard_delete:* keys) or a
-- user_profiles row has to satisfy the ON DELETE SET NULL constraint on these two
-- columns by scanning the entire sync_log table when there's no index to seek with.
CREATE INDEX IF NOT EXISTS idx_sync_log_time_entry_id ON public.sync_log(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_triggered_by ON public.sync_log(triggered_by);

-- ============================================
-- 3. time_entry: index item_id for the item-scoped rollup RPCs
-- ============================================
-- get_item_total_time, get_item_time_by_role, get_items_time_by_role, and
-- calculate_remaining_budget (the Abrechnung/Auswertung rollups) all filter
-- `te.item_id = ANY(p_item_ids)` without board_id. The only existing index
-- touching item_id is idx_time_entry_board_item(board_id, item_id) — item_id is
-- the second column, so it can't be seeked on its own; an item_id-only filter
-- degrades toward a full index/table scan. Partial on the same predicate every
-- one of those RPCs also filters by (same pattern as idx_time_entry_user_start_time
-- in 041_users_time_by_role.sql), so it stays small and only helps this query shape.
CREATE INDEX IF NOT EXISTS idx_time_entry_item_id
    ON public.time_entry (item_id)
    WHERE timer_state = 'finalized' AND deleted_at IS NULL;

-- ============================================
-- 4. monday_item: add the FK constraints every sibling cache table already has
-- ============================================
-- monday_column, monday_group, and monday_webhook all declare
-- `board_id REFERENCES monday_board(id)` — monday_item never got one, despite
-- board_id being NOT NULL since its original table definition
-- (002_tables.sql). parent_item_id (self-referencing) was never constrained
-- either. Both columns are already indexed (idx_monday_item_board_id,
-- idx_monday_item_parent_item_id), so this closes an integrity gap rather than
-- adding new query capacity.
--
-- group_id is deliberately left unconstrained — 012_monday_group_and_item_updates.sql
-- notes groups may not exist yet when an item is first cached; revisit once the
-- webhook-driven monday_group upsert is confirmed to always run first.
--
-- Guard against pre-existing orphans first (an ADD CONSTRAINT against orphaned
-- data fails outright rather than partially applying).
DO $$
DECLARE
    v_orphan_boards INTEGER;
    v_orphan_parents INTEGER;
BEGIN
    SELECT count(*) INTO v_orphan_boards
    FROM public.monday_item mi
    WHERE NOT EXISTS (SELECT 1 FROM public.monday_board mb WHERE mb.id = mi.board_id);

    SELECT count(*) INTO v_orphan_parents
    FROM public.monday_item mi
    WHERE mi.parent_item_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.monday_item p WHERE p.id = mi.parent_item_id);

    IF v_orphan_boards > 0 THEN
        RAISE EXCEPTION 'monday_item: % row(s) reference a board_id with no matching monday_board — fix or remove them before this migration can add the FK constraint.', v_orphan_boards;
    END IF;

    IF v_orphan_parents > 0 THEN
        RAISE EXCEPTION 'monday_item: % row(s) reference a parent_item_id with no matching monday_item — fix or remove them before this migration can add the FK constraint.', v_orphan_parents;
    END IF;
END $$;

ALTER TABLE public.monday_item
    ADD CONSTRAINT monday_item_board_id_fkey
        FOREIGN KEY (board_id) REFERENCES public.monday_board(id) ON DELETE CASCADE,
    ADD CONSTRAINT monday_item_parent_item_id_fkey
        FOREIGN KEY (parent_item_id) REFERENCES public.monday_item(id) ON DELETE SET NULL;

-- ============================================
-- 5. time_entry.deleted_by: fix type + add FK (data-integrity, not a perf change)
-- ============================================
-- Declared VARCHAR(255) with no constraint, but lib/database.ts's
-- softDeleteTimeEntry always stores the internal user_profiles.id UUID here (or
-- NULL) — grep confirms those are the only two write sites. Not a hot query path
-- (deleted_by isn't filtered/joined on anywhere), so this rides along as a
-- correctness fix rather than a new perf need.
--
-- NOTE: ALTER COLUMN ... TYPE rewrites the whole table and takes an
-- ACCESS EXCLUSIVE lock on time_entry for the duration — briefly blocks reads
-- and writes (timer start/pause/resume included). Fine at current table size;
-- worth running this migration during low traffic, or splitting this section
-- into its own migration, once time_entry is large enough for that to matter.
--
-- The existing `DEFAULT NULL` has to be dropped before the type change: Postgres
-- tries to recast a column's default expression to the new type too, and there's
-- no automatic varchar -> uuid cast (even for a literal NULL) — only the USING
-- clause governs the row-data conversion. Dropping it is a no-op behaviorally,
-- since NULL is already the implicit default for a nullable column with none.
ALTER TABLE public.time_entry ALTER COLUMN deleted_by DROP DEFAULT;

ALTER TABLE public.time_entry
    ALTER COLUMN deleted_by TYPE UUID USING NULLIF(deleted_by, '')::UUID;

ALTER TABLE public.time_entry
    ADD CONSTRAINT time_entry_deleted_by_fkey
        FOREIGN KEY (deleted_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
