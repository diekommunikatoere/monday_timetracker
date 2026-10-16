-- Migration: 044_item_sync_log.sql
-- Description: One log row per item column sync (all written columns inside `columns`),
--   replacing the per-column `sync_log`. `sync_log` is kept read-only as history.
--   Also fixes attribution: sync_log.triggered_by was a uuid FK, so syncs triggered by a
--   string source (e.g. 'webhook:monday-move') could never be logged. Here the source is
--   free text (`trigger_source`) and the user, when there is one, goes in `actor_id`.
--
--   Like time_entry_log (042/043) there is no retention job. Rows carry the full synced
--   values, so growth per row is larger than with sync_log.

CREATE TABLE IF NOT EXISTS public.item_sync_log (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id       text NOT NULL,
    item_id        text NOT NULL,
    success        boolean NOT NULL,
    error_message  text,
    columns        jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(columns) = 'array'),
    trigger_source text NOT NULL,
    actor_id       uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    time_entry_id  uuid,  -- no FK: the log must survive hard deletes (same as time_entry_log.entry_id)
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_sync_log_board_created ON public.item_sync_log(board_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_item_sync_log_item ON public.item_sync_log(item_id);
CREATE INDEX IF NOT EXISTS idx_item_sync_log_actor ON public.item_sync_log(actor_id);  -- serves the FK's ON DELETE SET NULL

ALTER TABLE public.item_sync_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.item_sync_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.item_sync_log TO service_role;

COMMENT ON TABLE  public.item_sync_log IS 'One row per item column sync; all written columns in `columns`. Replaces per-column sync_log.';
COMMENT ON COLUMN public.item_sync_log.columns IS 'Array of { column_id, sync_purpose, value, success, error } — one per configured column.';
COMMENT ON COLUMN public.item_sync_log.trigger_source IS '''user'' (actor_id set) or a source label such as ''webhook:monday-move'', ''sentinel:<reason>'', ''unknown''.';
