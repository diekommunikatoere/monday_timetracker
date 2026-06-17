-- Migration: 021_purge_trashed_monday_items.sql
-- Description: Permanently remove monday_items trashed more than p_days ago (default 31,
--   a 1-day buffer over Monday's 30-day trash retention) together with their time
--   entries. Runs in a single transaction: time entries are deleted first because
--   time_entry.item_id is ON DELETE SET NULL — deleting the items first would null the
--   link and we'd lose track of which entries to purge.
--   Subitems trashed via the parent cascade carry their own deleted_at, so they (and
--   their time entries) are swept by the same cutoff without special-casing.

CREATE OR REPLACE FUNCTION public.purge_trashed_monday_items(p_days INTEGER DEFAULT 31)
RETURNS TABLE (
    purged_items BIGINT,
    purged_time_entries BIGINT
) AS $$
DECLARE
    v_cutoff TIMESTAMPTZ := now() - make_interval(days => p_days);
    v_items BIGINT;
    v_entries BIGINT;
BEGIN
    WITH purgeable AS (
        SELECT id FROM public.monday_item
        WHERE deleted_at IS NOT NULL
          AND deleted_at < v_cutoff
    ),
    deleted_entries AS (
        DELETE FROM public.time_entry
        WHERE item_id IN (SELECT id FROM purgeable)
        RETURNING 1
    )
    SELECT count(*) INTO v_entries FROM deleted_entries;

    DELETE FROM public.monday_item
    WHERE deleted_at IS NOT NULL
      AND deleted_at < v_cutoff;
    GET DIAGNOSTICS v_items = ROW_COUNT;

    RETURN QUERY SELECT v_items, v_entries;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.purge_trashed_monday_items(INTEGER) IS
    'Permanently deletes monday_items trashed more than p_days ago (default 31) and '
    'their time entries. Intended to run from the cleanup cron.';
