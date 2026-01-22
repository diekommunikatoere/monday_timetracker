# MON-223: Support Recursive Sync for Linked Items

## Overview

When a "Job" item is updated in Monday.com, we often need to trigger an update for its linked "Budget" items. This task implements a one-level recursive sync mechanism.

## Proposed Changes

### 1. Database Schema

Add configuration fields to `board_config` to identify which board to look for links to and whether to trigger the sync.

**Migration (`supabase/migrations/014_add_linked_board_config.sql`):**

```sql
ALTER TABLE public.board_config 
ADD COLUMN IF NOT EXISTS linked_board_id TEXT,
ADD COLUMN IF NOT EXISTS sync_linked_items BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.board_config.linked_board_id IS 'Board ID to search for linked items when syncing';
COMMENT ON COLUMN public.board_config.sync_linked_items IS 'Whether to trigger sync for linked items on the linked_board_id';
```

### 2. Backend Logic (`lib/columnSync.ts`)

- Update `BoardConfig` interface and `getBoardConfig` function.
- Modify `syncItemColumns` to accept an `isRecursiveCall` flag.
- After direct sync is complete, if `sync_linked_items` is enabled and it's not already a recursive call:
  - Use `findLinkedItems` to discover connections.
  - Trigger `syncItemColumns` for each discovered item ID on the `linked_board_id`.

### 3. API Updates (`app/api/admin/boards/route.ts`)

- Update POST and PATCH handlers to support the new configuration fields.

### 4. Admin UI (`app/admin/page.tsx`)

- Add inputs to the board configuration modal:
  - `linked_board_id`: TextInput
  - `sync_linked_items`: Switch

## Implementation Detail in `syncItemColumns`

```typescript
export async function syncItemColumns(
    itemId: string, 
    boardId: string, 
    triggeredBy?: string, 
    timeEntryId?: string,
    isRecursiveCall = false // New parameter
): Promise<ItemSyncResult> {
    // ... Direct sync logic ...
    
    // Recursive sync for linked items (if enabled and not already in a recursive call)
    if (!isRecursiveCall && boardConfig.syncLinkedItems && boardConfig.linkedBoardId) {
        const linkedItemIds = await findLinkedItems(boardId, itemId, boardConfig.linkedBoardId);
        for (const linkedId of linkedItemIds) {
            await syncItemColumns(linkedId, boardConfig.linkedBoardId, triggeredBy, timeEntryId, true);
        }
    }
    
    return result;
}
```

## Verification

1. Configure Job Board with `linked_board_id = (Budget Board ID)` and `sync_linked_items = true`.
2. Configure Budget Board with `budget_used` column mapping.
3. Finalize a time entry for a Job item.
4. Verify that both the Job Board and the linked Budget Board items are updated.
