# Plan: ID-Based Metadata & Simplified Sync Configuration

## Objective

Transition the storage of time entries and board configurations to a robust ID-based dimension model while significantly simplifying the Admin Configuration UX. We will focus exclusively on "Budget Used" synchronization and ensure mandatory bi-directional board linking for data integrity.

## 1. Database Schema Changes (Dimensions)

### 1.1 `monday_item` (Item Dimension)

Caches item names and hierarchy.

### 1.2 `monday_board` (Board Dimension)

Caches board names.

### 1.3 `monday_column` (Column Dimension)

Caches available columns for a board to speed up the Admin UI.

### 1.4 `time_entry` Normalization

Drop redundant text columns (`board_name`, `item_name`, `parent_item_name`, `task_name`) and rely on JOINs with dimension tables.

## 2. Simplified Configuration Model

We will refactor `board_config` and `column_sync_config` to focus on a single, high-value sync purpose:

### 2.1 Refactored `board_config`

- **Removed Fields**: `sync_total_time`, `sync_time_by_role`, `sync_remaining_budget`, `currency_symbol`.
- **Default Currency**: Fixed to `€`.
- **Mandatory Logic**: `sync_linked_items` will be treated as mandatory. The UI will enforce that every configured Job Board must be linked to a Budget Board, and vice-versa.

### 2.2 Refactored `column_sync_config`

- **Focus**: Only `sync_purpose = 'budget_used'` will be visible/configurable in the simplified Admin UI.
- **Hidden Fields**: `time_format`, `include_breakdown`.

## 3. Usability & Navigation Enhancements (Admin settings)

To improve the usability of the admin settings, we will implement:

1. **Guided Configuration Wizard**:
    - **Step 1: Identify Budget Board**: Select the board where the overall project budget is managed.
    - **Step 2: Link Job Boards**: Select the boards where time is actually tracked.
    - **Step 3: Map Columns**: Select the "Budget Used" column on the Budget Board and Job Boards.
2. **Direct Action Tiles**:
    - The Board Overview tiles will feature a prominent **"Sync Now"** button. This allows admins to trigger a board-wide sync without entering the configuration details.
    - Add a **"Status Indicator"** (e.g., Green for synced, Yellow for pending, Red for configuration errors) directly to the tiles.
3. **Navigation Fixes**:
    - **Correct Breadcrumbs**: Ensure breadcrumbs are dynamic and correctly navigate to the exact view/step clicked.
    - **Smart "Back" Button**: Update the "Back" button to use history-aware navigation (previous screen) rather than blindly returning to the Admin home page.
4. **Visual Board Map**: A clear UI representation of the data flow: `[Job Boards] --(tracked time)--> [Budget Board]`.
5. **Bi-directional Link Validation**:
    - The app will automatically check if Monday.com `board_relation` columns are correctly set up in both directions.
    - Provide a "Fix in Monday.com" shortcut for broken links.
6. **Smart Column Detection**: Automatically suggest relevant columns based on name patterns.

## 4. Migration Strategy

1. **Phase 1: Dimensions**: Create dimension tables and backfill from history.
2. **Phase 2: Config Refactor**: Migrate existing settings to the simplified model.
3. **Phase 3: Logic Cleanup**: Remove code paths associated with redundant sync purposes.
4. **Phase 4: UI Overhaul**: Deploy the Guided Wizard and the updated Tile Overview.

## 5. Synchronization Strategy

- **On Demand**: When a user selects a task or board, the dimension cache is updated.
- **Dashboard Context Integration**: Use `boardIds` from the Dashboard Widget context to pre-populate or suggest boards.
- **Bi-directional Priority**: Ensure that syncing any item on a "Job Board" immediately triggers a roll-up calculation for the linked item on the "Budget Board".
