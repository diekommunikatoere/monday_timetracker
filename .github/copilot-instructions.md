# DKI TimeTracker - AI Coding Agent Instructions

## Project Overview

A Next.js time tracking application embedded within monday.com as a dashboard widget. Users track time via timer or manual entries, with data stored in Supabase PostgreSQL and cached in Redis. Time entries eventually sync to monday.com boards as subitems.

**Stack**: Next.js 16 (App Router), React 19, Supabase (PostgreSQL), Redis, monday.com SDK, Mantine UI components

## Authentication & User Context

**Critical**: This app does NOT implement its own authentication. Users are authenticated through monday.com's platform when the widget loads.

-   User identity comes from `monday-context` header (see `.github/instructions/authentication.instructions.md`)
-   Client-side: Use `useMondayContext()` hook to access `userProfile` (Supabase user) and `mondayUser` (monday.com user)
-   Server-side: Extract context via `getMondayContext(request)` from `lib/monday.ts`, then fetch user from `user_profiles` table using `monday_user_id`
-   All API routes require `monday-context` header - client passes it via `monday.get("context")` from `monday-sdk-js`

**Example server-side pattern**:

```typescript
const context = await getMondayContext(request);
const { data: userId } = await supabaseAdmin.from("user_profiles").select("id").eq("monday_user_id", context.user.id).single();
```

## Core Architecture

### 3-Tier Timer State Model

The timer system uses **three related tables** for accurate time tracking across devices/sessions:

1. **`time_entry`** - The final time record (draft or finalized)

    - `is_draft=true` while timer is active
    - Stores final `duration`, `task_name`, `comment` when saved

2. **`timer_session`** - Active timer state per user (one per user)

    - Unique constraint on `user_id` (only one active session allowed)
    - Tracks `elapsed_time` (milliseconds), `is_paused`, `draft_id`
    - Used for real-time sync via Supabase subscriptions

3. **`timer_segment`** - Individual run/pause intervals
    - Each start/pause creates a segment with `start_time`, `end_time`
    - **No boolean flags** - segments are simply intervals
    - Running segment: `end_time IS NULL`
    - Paused segment: has both `start_time` and `end_time`

**Critical**: When calculating elapsed time, exclude pause segments:

```sql
-- See supabase/migrations/006_update_finalize_draft_exclude_pauses.sql
SELECT SUM(EXTRACT(epoch FROM (end_time - start_time)))
FROM timer_segment
WHERE session_id = ? AND end_time IS NOT NULL
```

### Database Access Pattern

-   **Use Supabase Admin client** (`lib/supabase/server.ts`) for all server-side DB operations
-   **Use Supabase client** (`lib/supabase/client.ts`) for real-time subscriptions in React hooks
-   **Never use sqlite** - it's a legacy dependency
-   **Cache invalidation**: Call `cacheHelper.clearPattern()` after writes (see `lib/database.ts`)

### Redis Caching Strategy

-   Cache reads in `lib/database.ts` functions (e.g., `getAllTimeEntries()`)
-   TTL: 300 seconds (5 minutes) for time entries
-   Pattern: `time_entry:*` for bulk invalidation
-   Available via Docker Compose (port 6379) + Redis Commander GUI (port 8081)

### Monday.com Integration

All monday.com API calls go through `lib/monday.ts`:

-   `getConnectedBoards(boardIds)` - Fetch boards by IDs from widget context
-   `getBoardTasks(boardId)` - Get items/subitems with pagination (500 items/page)
-   Uses `@mondaydotcomorg/api` client with `apiVersion: "2025-10"`
-   Token from `MONDAY_API_TOKEN` environment variable

**Critical**: Monday API has complexity limits. Check `complexity.query` in responses and implement pagination for large boards.

## Development Workflow

### Starting Services

```bash
npm run dev  # Starts Supabase, Redis, Next.js, and ngrok tunnel (port 8301)
```

This single command:

1. Starts Docker Compose (Redis + Redis Commander)
2. Starts Supabase local stack
3. Runs Next.js dev server
4. Creates monday apps tunnel via `mapps tunnel:create -p 8301`

**Individual commands**:

-   Database: `npm run db:reset` (reapply migrations)
-   Redis GUI: `npm run redis:gui` (opens http://localhost:8081)
-   Supabase Studio: `npm run db:studio` (opens http://localhost:54323)

### Database Migrations

-   Location: `supabase/migrations/*.sql`
-   Auto-applied on `supabase start` or `npm run db:reset`
-   Create new: `supabase migration new <name>`, then edit SQL file
-   **Important**: Migrations use **Postgres RPC functions** for complex operations (see `finalize_draft` and `finalize_segment` RPCs)

### Component Patterns

**Use own components or Mantine components** (UI library):

```tsx
import { Button, TextField, Loader } from "@mantine/core";
// or import from own components in ui/ folder
```

**State management**:

-   Timer state: `useTimerState()` hook with real-time Supabase subscriptions
-   Time entries: `useTimeEntries()` hook with React Query
-   Comment field: `useCommentFieldState()` for auto-save draft comments

**Real-time sync pattern** (see `hooks/useTimerState.ts`):

```typescript
const channel = supabase
	.channel("timer-updates")
	.on(
		"postgres_changes",
		{
			event: "*",
			schema: "public",
			table: "timer_session",
		},
		(payload) => {
			// Update local state
		}
	)
	.subscribe();
```

## API Routes Structure

All timer operations are POST endpoints under `/api/timer/`:

-   `start` - Create new session or resume paused session
-   `pause` - Finalize current segment, mark session as paused
-   `reset` - Delete draft and session (full reset)
-   `soft-reset` - Delete session but keep draft (for manual entry editing)
-   `session` - GET active session for current user

**Pattern**: All routes use `getMondayContext()` for auth, then operate on user's data via `user_id`.

## Type Safety

-   Database types auto-generated in `types/database.ts` (from Supabase CLI)
-   Import types: `import type { Database } from "@/types/database"`
-   Use helper types:
    ```typescript
    type TimeEntry = Database["public"]["Tables"]["time_entry"]["Row"];
    type TimeEntryInsert = Database["public"]["Tables"]["time_entry"]["Insert"];
    ```

## Styling

-   Global styles: `app/globals.scss`
-   Component styles: `public/css/components/*.css`
-   Monday theme integration: `public/css/mondayThemeMapping.css`
-   Custom fonts: `public/fonts/` (Gibson, Gill Sans, Geist Mono)

## Environment Variables

Required for local dev (`.env.local`):

```bash
# Supabase (from `supabase start` output)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Monday.com
MONDAY_API_TOKEN=<your-token>

# App
PORT=8301
NODE_ENV=development
```

## Common Patterns

### Creating a New API Route

1. Add route file: `app/api/<feature>/route.ts`
2. Extract context: `const context = await getMondayContext(request)`
3. Fetch user: Query `user_profiles` by `monday_user_id`
4. Perform DB operation via `lib/database.ts` functions
5. Return JSON response

### Adding a Database Function

1. Edit `lib/database.ts` - implement function with types
2. Use `supabaseAdmin` client from `lib/supabase/server`
3. Add caching with `cacheHelper.get()` / `cacheHelper.set()`
4. Invalidate cache after writes: `cacheHelper.clearPattern()`

### Working with Timer State

-   **Never directly query timer tables in components** - use `useTimerState()` hook
-   Hook handles optimistic updates + rollback on API errors
-   Real-time updates automatically sync across devices via Supabase subscriptions
-   Debounced to prevent update storms (200ms window)

## Debugging

-   Supabase logs: `npm run supabase:logs`
-   Redis data: Access Redis Commander at http://localhost:8081
-   Database: Supabase Studio at http://localhost:54323
-   Check `monday-context` header in Network tab for API auth issues
