# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A time-tracking app that runs **embedded inside monday.com** as a dashboard widget / sidebar item view. Users track time with a timer or manual entries; data lives in Supabase (PostgreSQL) and is cached in Redis. Finalized time is pushed back to monday.com board columns (total time, time-by-role, remaining budget).

Stack: Next.js 16 (App Router) · React 19 · Supabase · Redis (ioredis) · monday.com SDK + GraphQL API · Mantine UI · Zustand.

## Commands

```bash
npm run dev         # next dev (default port 3000; widget runs at PORT 8301 in monday)
npm run build       # next build  — also the typecheck gate (noEmitOnError + strict route types)
npm run start        # production server
npm run expose      # mapps tunnel:create -p 8301  (monday Apps CLI tunnel for live widget testing)
npm run db:migrate  # supabase db push  (apply migrations to the linked Supabase project)
```

There is **no test runner and no lint script** configured. `npm run build` is the de-facto verification step — run it to catch type and route errors. Migrations live in `supabase/migrations/` and are applied with the Supabase CLI (`supabase db push` / `supabase db reset` locally, `supabase migration new <name>` to create).

> Note: `SETUP.md` and `.github/copilot-instructions.md` describe a local Docker-Compose + local-Supabase workflow and npm scripts (`db:reset`, `redis:gui`, `services:start`, etc.) that **no longer exist** in `package.json`. Treat those docs as historical. `.env.local` points at a **remote** Supabase project and a `REDIS_URL`; there is no `docker-compose.yml`.

## Authentication (read this before touching any API route)

The app has **no auth of its own** — identity comes from monday.com. The actual current mechanism is a **signed JWT session token**, not the `monday-context` header that older docs describe:

- **Client**: gets the token via `monday.get("sessionToken")` (see `stores/mondayStore.ts`) and sends every API request with `Authorization: Bearer <sessionToken>`.
- **Server**: `verifyMondayJwt(authHeader)` in [lib/monday-auth.ts](lib/monday-auth.ts) verifies it with `MONDAY_SIGNING_SECRET` and returns `{ userId, accountId, isAdmin, isValid }`. `userId`/`accountId` are the **monday** IDs.
- Routes then resolve the internal Supabase user with `getUserProfileByMondayId(session.userId)` / `findOrCreateUserByMondayId(...)` from [lib/database/users.ts](lib/database/users.ts), and operate on data by the internal `user_profiles.id`.
- **Admin routes** additionally gate on `session.isAdmin` (403 otherwise).

The standard route preamble (copy this shape — see [app/api/time-entries/route.ts](app/api/time-entries/route.ts)):

```typescript
const authHeader = request.headers.get("authorization");
if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const session = verifyMondayJwt(authHeader);
if (!session.isValid) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
const userProfile = await getUserProfileByMondayId(session.userId);
```

The older `getMondayContext(request)` (parses the `monday-context` header) still exists in [lib/monday.ts](lib/monday.ts) but is used by only one route (`/api/sync/board/[boardId]`). Prefer the JWT pattern. Webhook (`/api/webhooks/monday`) and cron routes are **not** user-authenticated — see below.

## Timer architecture (3-table model)

A running timer spans three tables (defined in `supabase/migrations/002_tables.sql`, logic in [lib/database.ts](lib/database.ts) and the Postgres RPCs in `003_functions.sql`):

1. **`time_entry`** — the record itself. `is_draft = true` while a timer is live; gets a final `duration`, `task_name`, `comment` when finalized.
2. **`timer_session`** — one active session per user (unique on `user_id`). Holds `elapsed_time`, `is_paused`, `draft_id`. This table is what the client subscribes to for cross-device real-time sync.
3. **`timer_segment`** — individual run/pause intervals. **No boolean flags**: a running segment has `end_time IS NULL`; a finished/paused segment has both timestamps. Elapsed time = sum of completed segment durations; pauses are simply the gaps between segments.

Time math and finalization happen in **Postgres RPC functions** (`finalize_segment`, `finalize_time_entry`, `get_timer_session_with_elapsed`, `soft_reset_timer`, …), not in TypeScript — keep the source of truth there. Timer API routes under `app/api/timer/`: `start`, `pause`, `reset` (delete draft+session), `soft-reset` (delete session, keep draft for manual editing), `draft`, `finalize`, `session` (GET active).

## Data layer & caching

- **`supabaseAdmin`** ([lib/supabase/server.ts](lib/supabase/server.ts), service-role key `NEXT_SUPABASE_SECRET_KEY`) — all server-side DB work. RLS-bypassing; never import into client code.
- **`supabase`** ([lib/supabase/client.ts](lib/supabase/client.ts), anon key `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`) — client-side real-time subscriptions only.
- **Redis** ([lib/redis.ts](lib/redis.ts)) via `cacheHelper.get/set/del/clearPattern`. Time-entry reads in `lib/database.ts` are cached under the `time_entry:` prefix with a 300s TTL. **After any write, invalidate**: `cacheHelper.clearPattern("time_entry:*")`. Redis also carries `hard_delete:*` keys as a deferred-work queue drained by the cleanup cron.
- DB types are generated into `types/database/` and re-exported as `@/types/database`. Use `Database["public"]["Tables"]["time_entry"]["Row" | "Insert" | "Update"]`.
- `lib/supabase/pagination.ts` exists because Supabase caps rows per query at 1000 — use it for large result sets.

## monday.com integration

All monday API access goes through [lib/monday.ts](lib/monday.ts) (and `lib/monday/`), using `@mondaydotcomorg/api` `ApiClient` with token `MONDAY_API_TOKEN`. Key calls: `getConnectedBoards(boardIds)`, `getBoardTasks(boardId)` (paginates 500 items/page — watch the `complexity` budget in responses), `isSubitemsBoard`, `findLinkedItems`, `getItemDetails`. Note the API version is pinned per-call (e.g. `"2025-04"`) and varies between files.

**Column sync** ([lib/columnSync.ts](lib/columnSync.ts)) is the write-back path: after a time entry is finalized/updated/deleted it computes total time / per-role breakdown / remaining budget and writes them to configured monday board columns (config in the `board_config` / `column_sync_config` tables). Syncs can be queued (`queueItemSync` → `flushSyncQueue`) rather than run inline. For subitems, sync redirects to the parent item's columns.

**Webhooks** (`app/api/webhooks/monday/route.ts`): handles monday's `challenge` handshake, then a `switch` on event type (`create_pulse`, `update_name`, `move_pulse_into_group`, `move_pulse_into_board`, `delete_pulse`, `archive_pulse`, `restore_pulse`, `move_subitem`) to keep the local `monday_item` / `monday_group` mirror in sync and re-push stale parent budgets. **Known gap (see memory): group ops and moves to untracked boards fire no webhooks — the reconciliation cron is the backstop.**

**Cron routes** (auth: optional `Bearer ${CRON_SECRET}`, no user session):
- `/api/cron/sync-boards` — reconciles `monday_board` rows with the monday API and registers/reconciles webhooks (`?reconcile=true` prunes stale ones).
- `/api/cron/cleanup-soft-deletes` — purges orphaned soft-deletes, drains the Redis `hard_delete:*` queue into column syncs, and purges trashed monday items.

There is no `vercel.json`; cron scheduling is configured on the deployment platform, not in-repo.

## Client state (Zustand, not hooks)

State lives in `stores/*.ts` — Zustand stores that **replaced** an older top-level `hooks/` directory (now deleted; per-feature hooks that survive live co-located under `components/.../hooks/`). Stores don't auto-fetch; trigger fetches from `useEffect`. Each fetching store pulls the token via `useMondayStore.getState().sessionToken`. See [stores/CLAUDE.md](stores/CLAUDE.md) for the full per-store reference.

- `mondayStore` — boots the monday SDK: fetches context + `me` + session token in parallel, calls `/api/auth/monday-user`, populates `userStore`. Entry point for the whole app.
- `userStore` — monday user + Supabase profile + theme (theme persisted to localStorage **and** the DB via `/api/user/theme`).
- `timerStore` / `draftStore` — timer + draft comment auto-save.
- `timeEntriesStore` / `itemTimeEntriesStore` — entry lists (global vs per-item).
- `appStore`, `modalStore` — UI state.

Persisted stores use `skipHydration: true` + the `useHydration()` helper in [lib/store-utils.ts](lib/store-utils.ts) to avoid SSR hydration mismatches; `components/StoreProvider.tsx` (in the root layout) drives rehydration.

## App surfaces

Four App-Router entry pages render into different monday widget contexts: `app/dashboards/` (main timer/table widget), `app/dashboards/timerView/`, `app/sidebar/itemView/` (per-item sidebar), and `app/admin/` (board/column-sync/role configuration). `app/page.tsx` is intentionally empty. Components are organized as `components/ui/` (the in-house design system, barrel-exported from `components/index.ts`) and `components/features/`, `components/dashboard/`, `components/sidebar/`. Path aliases: `@/*` → repo root, `@api/*` → `app/api/*`.

## Styling

Mantine + custom SCSS. Global: `app/globals.scss`. Component CSS and monday theme mapping under `public/css/`. The app mirrors monday's light/dark/black theme via the context, but a user's explicit theme choice (persisted in the DB) takes precedence over the platform theme — don't reintroduce auto-syncing the platform theme into `userStore` (it caused reversion loops).

## Environment variables

`.env.local` (remote dev) / `.env.production`. Note the Supabase keys use the **newer** naming in `.env.local`:

```
MONDAY_API_TOKEN                                  # monday GraphQL API
MONDAY_SIGNING_SECRET                             # verifies session-token JWTs
NEXT_PUBLIC_SUPABASE_URL
NEXT_SUPABASE_SECRET_KEY                          # service role (server)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY      # anon (client)
REDIS_URL                                         # ioredis connection string
CRON_SECRET                                        # optional, gates /api/cron/*
APP_ID, PORT (8301), NODE_ENV
```

(`.env.production` still lists the legacy `SUPABASE_SERVICE_ROLE_KEY` / `..._ANON_KEY` names — confirm which the deployment actually reads.)

## Gotchas

- TypeScript is **non-strict** (`strict: false`, `noImplicitAny: false`) and `any` is common — but `npm run build` still fails the build on type errors (`noEmitOnError`).
- The legacy SQLite mention in `README.md` is dead — storage is Supabase only.
- Soft-delete is a real workflow: deletes are reversible via an undo token + the cleanup cron; don't assume a "deleted" entry is gone.
