# CLAUDE.md — `stores/`

Client state for the app, as **Zustand** stores. These replaced an older top-level `hooks/` directory (now deleted); per-feature hooks that remain live co-located under `components/.../hooks/`, not here.

## Boot sequence (read first)

`mondayStore` is the entry point. Each page (`app/dashboards/`, `app/dashboards/timerView/`, `app/sidebar/itemView/`, `app/admin/*`) calls `initializeMondayContext()` from a mount `useEffect`. That action:

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
| `timerStore` | `timer-store` | `comment`, `draftId`, `sessionId` |
| `draftStore` | `draft-store` | `comment`, `taskName` |

`skipHydration` means they do **not** auto-rehydrate. [`components/StoreProvider.tsx`](../components/StoreProvider.tsx) (mounted in the root layout) calls `.persist.rehydrate()` on these three after client mount — this is what prevents Next.js hydration mismatches. In components that render persisted values, gate on `useHydration()` from [`lib/store-utils.ts`](../lib/store-utils.ts) until hydrated. If you add a new persisted store, add its `rehydrate()` call to `StoreProvider`.

## Store reference

| Store | Persist | Purpose / notes |
|-------|:------:|------|
| `mondayStore` | — | Monday SDK bootstrap. Owns `rawContext`, `sessionToken`, init/loading/error flags, theme listener. Source of the session token for every other store. |
| `userStore` | theme | Monday user + Supabase profile + `authenticated`. Holds `theme` (`MondayTheme`: black/light/dark) and computed `appTheme` (light/dark); exports `mapMondayThemeToAppTheme`. `toggleTheme` persists to DB via `POST /api/user/theme`. Note: at runtime the user fields are filled by `mondayStore`, not this store's own setters. |
| `timerStore` | comment, draftId, sessionId | **Pure state container** — sessionId/draftId/elapsedTime/status (`idle`/`running`/`paused`)/comment/`_serverSync`. Does no API calls; orchestration lives in [`components/features/timer/hooks/useTimer.ts`](../components/features/timer/hooks/useTimer.ts). Exposes `useShallow` selector hooks: `useTimerSession`, `useTimerElapsed`, `useTimerComment`, `useTimerUIState`, `useTimerComputed`. Types from `@/types/timer.types`. |
| `draftStore` | comment, taskName | Draft comment auto-save (500 ms debounce → `PATCH /api/timer/draft`) and manual finalize (`saveDraft` → `POST /api/timer/finalize`). `setComment` auto-derives `taskName`. Remember to `clearDebounce()` on unmount. |
| `timeEntriesStore` | — | Current user's finalized entries for the table. `fetchTimeEntries(userId)` → `GET /api/time-entries`; filters out the live running entry (`end_time`/`duration` null). |
| `itemTimeEntriesStore` | — | Per-item (sidebar) entries across all users, with `byRole`/`byUser` aggregations and `filters` (date range, role, user). `setFilters` auto-refetches. `GET /api/items/:itemId/time-entries`. |
| `appStore` | — | Connected boards from the widget context. `loadConnectedBoards()` → `POST /api/connectedBoards`. |
| `modalStore` | — | Pure UI booleans: `showTimerSave`, `showEmptyCommentConfirmation` (+ open/close). |
