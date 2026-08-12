# CLAUDE.md — `stores/`

Client state for the app, as **Zustand** stores. These replaced an older top-level `hooks/` directory (now deleted); per-feature hooks that remain live co-located under `components/.../hooks/`, not here.

## Boot sequence (read first)

`mondayStore` is the entry point. Each app surface calls `initializeMondayContext()` from a mount `useEffect` — `app/dashboards/layout.tsx` (shared by every `/dashboards/*` route: the main table/calendar view, `timerView`, and the analytics sub-routes), `app/sidebar/itemView/`, and `app/admin/page.tsx` / `app/admin/boards/[boardId]/`. That action:

1. fetches monday `context` + `me` + `sessionToken` in parallel via the monday SDK,
2. POSTs `/api/auth/monday-user` to find/create the Supabase user,
3. populates `userStore` (monday user, Supabase profile, theme),
4. installs a `monday.listen("context", …)` listener for live theme changes.

Until this resolves, `sessionToken` is `null` and **every other store's fetch is a no-op** (they all early-return when the token is missing).

## Shared conventions

- **Auth**: any store that hits an API reads `useMondayStore.getState().sessionToken` and sends `Authorization: Bearer <token>`. This is the JWT pattern the server verifies with `verifyMondayJwt` (see root `CLAUDE.md`) — not the `monday-context` header.
- **No auto-fetch**: stores never fetch on creation. Trigger `fetch*`/`load*` actions from a component `useEffect`.
- **Selectors**: select narrow slices — `useStore((s) => s.value)` — to avoid needless re-renders. For object/multi-field selections use `useShallow` (see `timerStore`'s selector hooks) or you'll get re-render loops.
- **User-facing strings are German** in the timer/entries stores (e.g. `"Unzugeordneter Zeiteintrag"`). Match that when adding messages.

## Persistence & SSR hydration

Three stores persist to `localStorage` via the `persist` middleware, each with `skipHydration: true`:

| Store | localStorage key | Persisted fields (`partialize`) |
|-------|------------------|----------------------------------|
| `userStore` | `user-store` | `theme` only |
| `timerStore` | `timer-store` | `comment`, `entryId` |
| `timeEntriesStore` | `time-entries-store` | `pageSize` only |

`skipHydration` means they do **not** auto-rehydrate. [`components/StoreProvider.tsx`](../components/StoreProvider.tsx) (mounted in the root layout) calls `.persist.rehydrate()` on these three after client mount — this is what prevents Next.js hydration mismatches. In components that render persisted values, gate on `useHydration()` from [`lib/store-utils.ts`](../lib/store-utils.ts) until hydrated. If you add a new persisted store, add its `rehydrate()` call to `StoreProvider`.

## Store reference

| Store | Persist | Purpose / notes |
|-------|:------:|------|
| `mondayStore` | — | Monday SDK bootstrap. Owns `rawContext`, `sessionToken`, init/loading/error flags, theme listener. Source of the session token for every other store. |
| `userStore` | theme | Monday user + Supabase profile + `authenticated`. Holds `theme` (`MondayTheme`: black/light/dark) and computed `appTheme` (light/dark); exports `mapMondayThemeToAppTheme`. `toggleTheme` persists to DB via `POST /api/user/theme`. Also owns `dashboardViewMode` (`"table"` or `"calendar"`, in-memory only — not persisted) driving the main dashboard's view switcher. Note: at runtime the user fields are filled by `mondayStore`, not this store's own setters. |
| `timerStore` | comment, entryId | **Pure state container** for the 2-table model — `entryId`/`elapsedTime`/`startTime`/status (`idle`/`running`/`paused`)/comment/`_serverSync`. No `sessionId`/`draftId` (there's no `timer_session` table anymore — see root `CLAUDE.md`'s Timer architecture). Does no API calls; orchestration lives in [`components/features/timer/hooks/useTimer.ts`](../components/features/timer/hooks/useTimer.ts), including the debounced comment auto-save (`PATCH /api/timer/comment`) — there is no separate draft store. Exposes `useShallow` selector hooks: `useTimerSession`, `useTimerElapsed`, `useTimerComment`, `useTimerUIState`, `useTimerComputed`. Types from `@/types/timer.types`. |
| `timeEntriesStore` | pageSize | Current user's **entire** entry history for the dashboard table, bulk-loaded. `fetchTimeEntries(userId)` → `GET /api/time-entries` (no query params — returns all entries; the live running entry is excluded server-side via `timer_state <> 'running'`). Search/role/board/date `filters`, `page`, and pagination are all client-side afterwards — see [`components/dashboard/hooks/useFilteredTimeEntries.ts`](../components/dashboard/hooks/useFilteredTimeEntries.ts), which derives the visible page (Fuse.js tokenized-fuzzy search over `task_name`+`comment`, mirroring `TaskItemSelector`). `setFilter`/`setPageSize` reset `page` to 1; none of `setPage`/`setPageSize`/`setFilter` refetch — they're pure in-memory. `refetch(userId)` just re-runs `fetchTimeEntries`; page-clamping after a filter/delete narrows the result set happens in `TimeEntriesTable`, not the store. A monotonic request-id guards against rapid refetches resolving out of order. |
| `itemTimeEntriesStore` | — | Per-item (sidebar) entries across all users, with `byRole`/`byUser` aggregations and `filters` (date range, role, user). `setFilters` auto-refetches. `GET /api/items/:itemId/time-entries`. |
| `abrechnungStore` | — | Backs the Abrechnung (budget reconciliation) dashboard: `activeBoards` from `fetchActiveBudgetData` (`GET /api/analytics/abrechnung`, refetched when the server-side `startDate`/`endDate` filter changes), plus a lazily-fetched `archivePeriods` list and per-period `selectedArchive*` drill-down (`GET /api/analytics/abrechnung/archive/:boardId`). `search`/`utilizationMin`/`utilizationMax` are pure client-side filters (see `useFilteredAbrechnung`) and never refetch. A monotonic request-id guards `fetchActiveBudgetData` against out-of-order responses, same pattern as `timeEntriesStore`. |
| `auswertungStore` | — | Backs the Auswertung (per-user weekly utilization) dashboard: `rows` (`AuswertungUserRow[]`) from `fetchAuswertung` (`GET /api/analytics/auswertung`) for the selected ISO week. `goToCurrentWeek`/`goToWeek`/`stepWeek` change the week and refetch; `filters.search` is a pure client-side name filter (see `useFilteredAuswertung`) and never refetches. Same out-of-order-response guard as `abrechnungStore`. |
| `appStore` | — | Connected boards from the widget context. `loadConnectedBoards()` → `POST /api/connectedBoards`. |
| `modalStore` | — | Pure UI booleans: `showTimerSave`, `showEmptyCommentConfirmation` (+ open/close). |
