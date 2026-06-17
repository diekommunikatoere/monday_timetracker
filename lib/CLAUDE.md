# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What lives here

`lib/` is the server-side business-logic layer. Every API route in `app/api/` imports from here; nothing in `lib/` imports from `app/`.

| Sub-module | Responsibility |
|---|---|
| `database.ts` | Time-entry and timer CRUD, soft-delete lifecycle, board/item upsert |
| `database/users.ts` | monday-to-Supabase user identity bridge (`findOrCreateUserByMondayId`) |
| `redis.ts` | `cacheHelper` wrapper (get/set/del/clearPattern/keys) + raw `redis` client |
| `monday.ts` | monday GraphQL API client — board/task queries, item details |
| `monday-auth.ts` | JWT verification (`verifyMondayJwt`) |
| `monday/columnSync.ts` | monday API layer — fetch board columns, write column values, format values |
| `monday/utils.ts` | Column-type compatibility metadata (`COMPATIBLE_COLUMN_TYPES`) |
| `monday/webhooks.ts` | Webhook registration and reconciliation per board |
| `columnSync.ts` | **Orchestrator** — computes totals (via Postgres RPCs), calls `monday/columnSync.ts` to write them back. This is the entry point for callers. |
| `supabase/server.ts` | `supabaseAdmin` (service-role, RLS-bypassing) — all server DB access |
| `supabase/client.ts` | `supabase` (anon key) — client-side real-time subscriptions only |
| `supabase/pagination.ts` | Paginates past Supabase's 1 000-row cap |
| `permissions/timeEntry.ts` | Ownership-based permission flags (`getTimeEntryPermissions`) |
| `time/calculations.ts` | Local-timezone time math helpers (all values in **seconds**) |
| `time/formatting.ts` | Display formatters — see `formatTime` trap below |
| `store-utils.ts` | `useHydration` / `useSSRSafeValue` — SSR hydration gate for persisted Zustand stores |
| `utils.ts` | Barrel: re-exports `./time` and `./permissions` |
| `version.ts` | `APP_VERSION` from `package.json` (build-time constant) |

## Critical invariants

### Two Supabase clients — never mix them
- `supabaseAdmin` (`lib/supabase/server.ts`) — service-role key, bypasses RLS. **Never import into client-side code** (`use client` components, stores).
- `supabase` (`lib/supabase/client.ts`) — anon key, respects RLS. Used only for real-time subscriptions on the client.

### Monday IDs ≠ Supabase UUIDs
`verifyMondayJwt` returns `userId` / `accountId` that are **monday IDs** (integers as strings). Internal DB operations use `user_profiles.id` (a UUID). Always resolve via `getUserProfileByMondayId` or `findOrCreateUserByMondayId` from `database/users.ts` before touching time entries.

### Cache invalidation after every write
After any write to `time_entry`, call both:
```ts
await cacheHelper.del(`${CACHE_PREFIX}${id}`);        // per-entry
await cacheHelper.clearPattern(`${CACHE_PREFIX}*`);   // list caches
```
`CACHE_PREFIX = "time_entry:"`, TTL is 300 s. Skipping this causes stale reads that survive across requests.

### Time math lives in Postgres, not TypeScript
Elapsed time, segment finalization, and session management are handled by RPC functions (`finalize_segment`, `finalize_time_entry`, `get_timer_session_with_elapsed`, `soft_reset_timer`, etc.). Do not reimplement this logic in TypeScript.

### Column sync: two layers, one entry point
`lib/columnSync.ts` is the **orchestrator** — callers use `syncAfterFinalize`, `syncAfterUpdate`, `syncAfterDelete`. It reads board/column config from the DB, fetches time totals via Postgres RPCs, and delegates writes to `lib/monday/columnSync.ts`. Do not call `lib/monday/columnSync.ts` directly for sync operations.

### Redis `hard_delete:*` is a deferred work queue
`softDeleteTimeEntry` writes a `hard_delete:${id}` key with a 10 s TTL. The cleanup cron drains this queue to trigger column syncs and eventual hard deletes. `restoreTimeEntry` removes the key to cancel. Do not delete `hard_delete:*` keys outside of the restore/cleanup paths.

## Known traps

**`formatTime` takes milliseconds, not seconds.** Despite the parameter name `seconds`, the implementation divides by 1 000. Passing actual seconds will produce values 1 000× too small. See `lib/time/formatting.ts`.

**Undo token is not a signed JWT.** `softDeleteTimeEntry` returns a base64-encoded JSON payload `{ entryId, userId, exp }`. It prevents accidental misuse but is not cryptographically verified — ownership is enforced by the `.eq("user_id", userId)` DB filter in `restoreTimeEntry`.

**`getMondayContext` in `monday.ts` is deprecated.** It parses the `monday-context` header (legacy). Prefer `verifyMondayJwt` from `monday-auth.ts` for all new routes.

**`syncLinkedItems` is effectively always `true`.** The `board_config.sync_linked_items` flag exists but is overridden by a MON-228 fix that forces linked-item sync on regardless of the DB value.

**`supabase/pagination.ts` keyset cursor must be unique and sorted.** Mid-pagination inserts can be missed; range pagination is safer for stable data sets.

## Adding a new sync entry point

1. Call `getBoardConfig(boardId)` + `getColumnMappings(boardId)` to read config.
2. Use Postgres RPCs (`get_item_total_time`, `get_item_time_by_role`, `calculate_remaining_budget`) for time data — no in-TypeScript aggregation.
3. Pass results to `syncItemColumns(itemId, boardId, ...)` from `lib/columnSync.ts`, or use `queueItemSync` for burst-tolerant queuing.
4. Handle the sub-item redirect: `syncItemColumns` automatically calls `findLinkedItems` and redirects to the parent item's columns.
