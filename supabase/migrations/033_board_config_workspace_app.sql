-- Move board selection from monday dashboard-widget context to admin settings.
-- Adds display enablement + ordering to board_config and drops the columns made
-- dead by monday mirror columns (budget source, linked-board roll-up, and the
-- now-redundant sync flags collapse into a single sync_enabled).

ALTER TABLE board_config
  ADD COLUMN display_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN sort_order      integer NOT NULL DEFAULT 0,
  ADD COLUMN settings        jsonb   NOT NULL DEFAULT '{}'::jsonb,
  DROP COLUMN budget_column_id,
  DROP COLUMN budget_column_type,
  DROP COLUMN linked_board_id,
  DROP COLUMN sync_linked_items,
  DROP COLUMN sync_on_finalize,
  DROP COLUMN sync_budget_used;
