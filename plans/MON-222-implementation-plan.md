# MON-222: Implement findLinkedItems helper in lib/monday.ts

## Overview

This helper function is needed to identify items on a target board (e.g., Budget board) that are linked to an item on a source board (e.g., Jobs board) via `connect_boards` columns.

## Proposed Changes

### 1. Types (`lib/monday.ts`)

Define an interface for the function's return value.

```typescript
export interface LinkedItem {
    id: string;
    boardId: string;
}
```

### 2. Implementation (`lib/monday.ts`)

Implement `findLinkedItems(boardId: string, itemId: string, targetBoardId: string): Promise<string[]>`

**Query Details:**

- Fetch all columns of the source board to identify `board_relation` types.
- Fetch the specific item's column values.
- Filter columns whose `settings_str` matches the `targetBoardId`.
- Extract item IDs from the `value` property of matching columns.

**Parsing Logic:**
Monday's `connect_boards` column value is a JSON string:
`{"linkedPulseIds": [{"linkedPulseId": 12345}, {"linkedPulseId": 67890}]}`
or just an empty value.

## Implementation Snippet

```typescript
export async function findLinkedItems(boardId: string, itemId: string, targetBoardId: string): Promise<string[]> {
    const query = `
        query($boardId: ID!, $itemId: ID!) {
            boards(ids: [$boardId]) {
                columns {
                    id
                    type
                    settings_str
                }
                items_page(limit: 1, query_params: {ids: [$itemId]}) {
                    items {
                        column_values {
                            id
                            value
                        }
                    }
                }
            }
        }
    `;
    
    // ... API call ...
    
    // 1. Identify columns that link to targetBoardId
    const targetColumnIds = board.columns
        .filter(col => col.type === 'board_relation' || col.type === 'connect_boards')
        .filter(col => {
            try {
                const settings = JSON.parse(col.settings_str || '{}');
                return settings.boardId === targetBoardId || 
                       settings.boardIds?.includes(targetBoardId) ||
                       settings.board_id === targetBoardId;
            } catch (e) {
                return false;
            }
        })
        .map(col => col.id);
        
    // 2. Extract item IDs from those columns
    const linkedIds = new Set<string>();
    item.column_values
        .filter(cv => targetColumnIds.includes(cv.id))
        .forEach(cv => {
            try {
                const val = JSON.parse(cv.value || '{}');
                val.linkedPulseIds?.forEach(p => linkedIds.add(p.linkedPulseId.toString()));
            } catch (e) {}
        });
        
    return Array.from(linkedIds);
}
```

## Verification

- Cross-verify `settings_str` format for `board_relation` columns in Monday.com API docs.
- Test with boards having multiple connect_boards columns.
