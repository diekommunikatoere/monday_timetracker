# MON-220: Refactor lib/columnSync.ts to implement budget_used calculation

## Overview

Currently, the system supports syncing total time, time by role, and remaining budget. This task adds support for syncing the **total expenditure (Total Cost)** to a column named `budget_used`.

## Proposed Changes

### 1. Database Schema

Add a new column `sync_budget_used` to the `board_config` table to allow users to toggle this sync purpose globally for a board.

**Migration (`supabase/migrations/013_add_sync_budget_used_to_board_config.sql`):**

```sql
ALTER TABLE public.board_config 
ADD COLUMN IF NOT EXISTS sync_budget_used BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN public.board_config.sync_budget_used IS 'Whether to sync the total expenditure (Total Cost) to a separate column';
```

### 2. Backend Logic (`lib/columnSync.ts`)

- Add `syncBudgetUsed` to the `BoardConfig` interface.
- Update `getBoardConfig` to retrieve the new field.
- Add a new case in the `syncColumn` switch statement for `budget_used`.
- Update the filtering logic in `syncItemColumns` to respect the `syncBudgetUsed` setting.

### 3. API Updates (`app/api/admin/boards/route.ts`)

- Update POST and PATCH handlers to accept and save the `sync_budget_used` field.

### 4. Admin UI (`app/admin/boards/[boardId]/page.tsx`)

- Add a toggle in the board configuration UI to enable/disable `budget_used` sync.

## Implementation Details for `budget_used` sync

```typescript
case "budget_used": {
    // Determine budget source (similar to remaining_budget)
    let budgetAmount = 0;
    if (boardConfig.budgetColumnId) {
        const budget = await getBudgetFromColumn(boardId, itemId, boardConfig.budgetColumnId);
        budgetAmount = budget || 0;
    }

    // Call the RPC that calculates both total cost and remaining budget
    const budgetResult = await calculateRemainingBudget(boardId, itemId, budgetAmount);
    
    // We use total_cost for budget_used
    if (budgetResult) {
        value = budgetResult.total_cost.toFixed(2);
    } else {
        value = "0.00";
    }
    break;
}
```

## Verification Plan

1. Apply database migration.
2. Configure a `budget_used` column mapping for a board in the Admin UI.
3. Track some time with different roles having different hourly rates.
4. Verify that the `budget_used` column in Monday.com is updated with the correct total cost.
