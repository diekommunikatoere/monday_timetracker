# Plan: Rollup Sub-item Time to Parent Item

This plan addresses the issue where time entries added to sub-items fail to sync correctly because the system tries to update the sub-item itself on the main board, which results in an "Item not found" error. The solution is to redirect the sync to the parent item and ensure that the parent item's values include rollups from all its sub-items.

## Proposed Changes

### 1. Database RPC Functions (Supabase)

Update the following RPC functions to include time entries where the `parent_item_id` matches the provided item ID:

- `get_item_total_time`
- `get_item_time_by_role`
- `calculate_remaining_budget`

This ensures that when `syncItemColumns` is called for a parent item, it captures all time tracked against that item AND its sub-items.

### 2. Column Sync Logic (`lib/columnSync.ts`)

Modify `syncItemColumns` to detect if the provided `itemId` is a sub-item:

- Check the `time_entry` table for any entry with the given `itemId` that has a `parent_item_id`.
- If a `parent_item_id` is found, recursively call `syncItemColumns` with the `parent_item_id` instead.
- This redirection ensures that we always target the item that exists on the main board and contains the rollup columns.

## Implementation Steps

1. **Database Migration**: Create `supabase/migrations/016_rollup_subitem_time.sql` with the updated RPC definitions.
2. **Code Update**: Modify `lib/columnSync.ts` to implement the parent ID resolution logic.
3. **Verification**:
   - Add a time entry to a sub-item and verify the parent item's columns (e.g., `budget_used`) are updated.
   - Manually trigger a sync for a sub-item and verify it redirects to the parent.

## Benefits

- Resolves the "Item not found" error for sub-items.
- Provides automatic rollup of time and budget from sub-items to parent items.
- Simple and central implementation in `syncItemColumns` handles all sync entry points (finalize, update, delete, manual).
