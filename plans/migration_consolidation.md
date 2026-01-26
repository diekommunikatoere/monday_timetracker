# Supabase Migration Consolidation Plan

This plan outlines the steps to consolidate 21 migration files into 6 base categories to simplify the database schema management.

## 1. Structure Overview

Following the project's Database Migration Strategy, all database objects will be grouped into:

- `001_extensions.sql`: Extensions and global utility functions.
- `002_tables.sql`: All table definitions with final column states and foreign keys.
- `003_functions.sql`: All latest RPC functions.
- `004_triggers.sql`: All `updated_at` triggers.
- `005_indexes.sql`: All performance and unique indexes.
- `006_policies.sql`: All Row Level Security (RLS) policies.

## 2. Consolidation Details

### 2.1 Tables (`002_tables.sql`)

The following tables will be defined in their final state:

- `board_config`: (from `007`) + `sync_budget_used` (from `013`), `linked_board_id`, `sync_linked_items` (from `014`). **Redundant sync flags removed in `020` will be omitted.**
- `board_role_override`: (from `007`).
- `column_sync_config`: (from `007`) with updated check constraints (from `015`) and default sync purpose (from `020`).
- `monday_board`: (from `018`) - metadata for Monday.com boards.
- `monday_column`: (from `018`).
- `monday_item`: (from `018`) - metadata for Monday.com items (with board and parent item refs).
- `role`: Base table + `hourly_rate`, `is_active`, `color_hex` (from `007`).
- `sync_log`: (from `007`) audit log for sync operations.
- `time_entry`: Base table + `role_id` (FK to `role`), `deleted_at`, `deleted_by` (from `011`), and FKs to `monday_board` and `monday_item`. **Redundant text columns will be omitted.**
- `timer_segment`: Base table with FK to `timer_session`.
- `timer_session`: Base table with FK to `user_profiles` and `time_entry`.
- `user_profiles`: Base table + `team_ids` array.

### 2.2 Functions (`003_functions.sql`)

Latest versions of the following functions will be implemented:

- `get_user_time_entries`: Latest version using JOINs with dimension tables (from `019`).
- `finalize_time_entry`: Latest version that updates dimension tables and uses normalized IDs (from `019`).
- `create_timer_session` & `get_active_timer_session`: Base versions.
- `get_item_total_time`, `get_item_time_by_role`, `calculate_remaining_budget`: Latest versions supporting `TEXT[]` item IDs and sub-item roll-ups (from `016`, `017`).
- `get_effective_hourly_rate`: (from `007`).

### 2.3 Triggers (`004_triggers.sql`)

- `updated_at` triggers for: `user_profiles`, `role`, `time_entry`, `timer_session`, `board_config`, `board_role_override`, `column_sync_config`, `monday_board`, `monday_item`, `monday_column`.

### 2.4 Indexes (`005_indexes.sql`)

- Standard indexes for FKs and common query fields.
- Special indexes: `idx_timer_session_user_active` (Partial Unique), `idx_time_entry_deleted_at` (Partial).
- Dimension table indexes (from `018`).

### 2.5 Policies (`006_policies.sql`)

- Core policies for user tables.
- Public/Authenticated view policies for dimension tables (from `018`).

## 3. Execution Steps

1. **Backup**: Ensure current state is backed up (not strictly necessary here as I'm editing files, but good practice).
2. **Overwrite `002_tables.sql`**: Write the complete table definitions.
3. **Overwrite `003_functions.sql`**: Write the complete function definitions.
4. **Overwrite `004_triggers.sql`**: Write all triggers.
5. **Overwrite `005_indexes.sql`**: Write all indexes.
6. **Overwrite `006_policies.sql`**: Write all policies.
7. **Clean up**: Delete files `007_alters.sql`, `008_add_role_id_to_time_entry.sql`, ..., `021_add_board_config_fk.sql`.
8. **Verify**: Check that no references were missed.

## 4. Note on Data Migrations

The backfill scripts (e.g., `009`, backfill sections of `018`, `019`) are mostly relevant for migrating an *existing* database. In a consolidated set of base migrations, these are typically not needed for a clean installation. If the environment is already deployed, a `supabase db reset` would be required to apply these changes cleanly.
