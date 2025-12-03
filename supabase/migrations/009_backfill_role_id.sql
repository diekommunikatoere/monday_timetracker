-- Migration: Backfill role_id from existing role names
-- Populates the new role_id column by matching existing role names to role table IDs

-- Backfill role_id from existing role names
UPDATE public.time_entry te
SET role_id = r.id
FROM public.role r
WHERE te.role = r.name
  AND te.role_id IS NULL;

-- Log results for verification
DO $$
DECLARE
  v_updated_count INTEGER;
  v_unmatched_count INTEGER;
  v_total_entries INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_entries FROM public.time_entry;
  SELECT COUNT(*) INTO v_updated_count FROM public.time_entry WHERE role_id IS NOT NULL;
  SELECT COUNT(*) INTO v_unmatched_count FROM public.time_entry WHERE role IS NOT NULL AND role_id IS NULL;

  RAISE NOTICE 'Backfill complete: %/% entries have role_id populated, % entries with unmatched roles',
    v_updated_count, v_total_entries, v_unmatched_count;
END $$;