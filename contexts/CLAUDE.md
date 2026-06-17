# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What lives here

Two React context files. The contexts directory holds **only the context object and its consumer hook** — providers live elsewhere.

## TimerContext

`TimerContext` carries a `UseTimerReturn | null` (from `@/types/timer.types`). It is a global singleton:

- **Provider**: `components/features/timer/TimerProvider.tsx` — calls `useTimer()` and mounts `TimerContext.Provider`. Mounted in `app/layout.tsx` wrapping the entire app.
- **Consumer hook**: `useTimerContext()` — asserts non-null and returns `UseTimerReturn`. Used by `TimerContainer` and `TimerDashboardHeader` to destructure `{ state, actions, hasSession }`.

Because the provider is in `components/features/timer/` (not here), the context object itself is exported as a default and the consumer hook as a named export. Don't move the provider here — it lives next to `useTimer` intentionally.

## TimeEntriesContext

Carries a single `refetch: () => void` callback. This is a **page-scoped bridge** to avoid prop-drilling the `timeEntriesStore.refetch(userId)` call through nested components that trigger entry mutations.

- **Provider**: `TimeEntriesProvider` — co-located in this file. Mounted at page level in `app/dashboards/page.tsx` and `app/dashboards/timerView/page.tsx`, both of which pass `() => refetch(userId!)` from `useTimeEntriesStore`.
- **Consumer hook**: `useTimeEntriesRefetch()` — returns the bound `refetch` function. Call it after any mutation (finalize, delete, edit) that should reload the entries list.

Unlike `TimerContext`, this context does not extend to the root layout — it is only available within the dashboard page subtrees.

## Pattern: context vs store

These contexts complement, not replace, the Zustand stores in `stores/`:

- Stores (`timerStore`, `timeEntriesStore`, etc.) own **global async state and server communication**.
- These contexts solve **local tree concerns**: `TimerContext` lets deep components read `useTimer()` output without prop-drilling; `TimeEntriesContext` lets mutation components fire a list reload without owning the store subscription.
