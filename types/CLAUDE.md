# CLAUDE.md — `types/`

Hand-written and generated TypeScript types shared across the app. Import via the `@/types/*` alias (`@/*` → repo root, see `tsconfig.json`). DB-derived types are re-exported as `@/types/database` and are the most-used surface here.

## File map

| File | Import path | What it is |
|------|-------------|------------|
| [database/database.ts](database/database.ts) | `@/types/database` (re-exported) | **Generated** Supabase types. The big `Database` map, `Json`, the generic `Tables`/`TablesInsert`/`TablesUpdate`/`Enums`/`CompositeTypes` helpers, and `Constants`. Do not hand-edit. |
| [database/database.types.ts](database/database.types.ts) | `@/types/database` (re-exported) | **Hand-written extensions** on top of the generated types — safe from regeneration. Convenience row aliases, RPC result types, business-logic enums. |
| [database/index.ts](database/index.ts) | `@/types/database` | Barrel that re-exports a curated subset of the two files above. The canonical entry point (~22 importers). |
| [time-entry.ts](time-entry.ts) | `@/types/time-entry` | `TimeEntry` — the **flattened, display-ready** entry shape used by stores/UI. Not the raw DB row. |
| [timer.types.ts](timer.types.ts) | `@/types/timer.types` | Client-side timer domain for the 2-table model: `TimerStatus`/`TimerState`/`TimerStore*`/`ActiveTimer` (the `get_active_timers` row shape) and component-prop/API-response types. No `sessionId` — a live timer is just a non-finalized `time_entry`, tracked by `entryId`. |
| [IconProps.ts](IconProps.ts) | `@/types/IconProps` | `IconProps` / `IconComponentProps` for `components/icons/`. **Orphaned** — zero real importers; superseded by the local `types.ts` files under `components/ui/icons/` and `components/ui/buttons/`. |
| [monday.ts](monday.ts) | `@/types/monday` | monday SDK `context` shape (`MondayContext` etc.). **Currently imported nowhere** — reference spec, not load-bearing. |

## How the DB types are layered

- `database.ts` is the generated source of truth (every table's `Row`/`Insert`/`Update`/`Relationships`, the `view_monday_tasks` view, and all RPC `Functions` signatures). Access raw rows as `Database["public"]["Tables"]["<table>"]["Row" | "Insert" | "Update"]`.
- `database.types.ts` layers convenience aliases over that (e.g. `Role`, `BoardConfig`, `ColumnSyncConfig`, `MondayWebhook` and their `*Insert`/`*Update` variants), plus types the generator can't express:
  - **RPC result types** — `GetItemTimeByRoleResult`, `GetItemsTimeByRoleResult`, `GetUsersTimeByRoleResult` (Abrechnung/Auswertung analytics rollups), `CalculateRemainingBudgetResult`. The generated `Functions` entries return `Json` for these RPCs; these interfaces give that `Json` a shape — cast RPC results to them. (See the Gotchas below for three more that are defined but dead.)
  - **Business-logic enums** — `SyncPurpose`, `TimeFormat`, `SyncColumnType`, `BudgetColumnType` (used by the column-sync config / write-back path; see `lib/columnSync.ts`).
- New custom types go in `database.types.ts`, never in `database.ts`.

## Regenerating `database.ts`

It is generated from the live Supabase schema, but **there is no script wired up** — `package.json` only has `db:migrate` (`supabase db push`). The `npm run db:types` referenced in the header comment of `database.types.ts` does **not exist**; regenerate manually with the Supabase CLI (`supabase gen types typescript ...`) and paste the result in. After a migration changes the schema, regenerate or the types drift from the DB. `PostgrestVersion` is pinned to `14.1` in the generated map.

## Gotchas

- **Two different `TimeEntry`/`time_entry` shapes.** [time-entry.ts](time-entry.ts) `TimeEntry` is the app-facing shape with joins already resolved (`user_name`, `board_name`, `item_name`, `parent_item_*`, `role_name`). The DB row (`time_entry` Row in `database.ts`) stores only FKs. The display fields are filled by the read RPCs (`get_user_time_entries`, `get_item_time_entries`) and flattened in `lib/database.ts`; that same file strips them back out before any insert/update. Don't pass a `TimeEntry` straight into a DB write.
- **Three RPC result types are dead.** `GetTimerSessionWithElapsedResult`, `FinalizeSegmentResult`, and `GetCurrentElapsedTimeResult` in `database.types.ts` shape RPCs (`get_timer_session_with_elapsed`, `finalize_segment`, `get_current_elapsed_time`) that were dropped along with `timer_session` in the 2-table timer redesign (`supabase/migrations/030_timer_rls_realtime_drop_session.sql`). They're still defined and re-exported but have zero callers — don't reach for them; the live timer RPCs are `timer_start`/`timer_pause`/`timer_resume`/`timer_park`/`timer_finalize`/`timer_reset`/`get_active_timers`, typed via `@/types/timer.types`'s `ActiveTimer`, not a `database.types.ts` result interface.
- **`parent_item_id` / `parent_item_name` are not columns** on `time_entry`; they're resolved via the `monday_item` JOIN. They appear on `TimeEntry` and the RPC return rows but not on the table `Row`.
- **`monday.ts` is orphaned.** Nothing imports it; the live context comes from `monday.get("context")` in `stores/mondayStore.ts` against the SDK's own untyped payload. Wire these types in if you want typed context access, but don't assume they're in use today.
