# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Scope: the `components/` directory — the React/UI layer. For app-wide architecture (auth, data layer, timer DB model, monday integration, Zustand stores) see the root [CLAUDE.md](../CLAUDE.md) and [stores/CLAUDE.md](../stores/CLAUDE.md). This file documents how the UI is organized and the conventions specific to it.

## Layout & responsibilities

- **`ui/`** — the in-house design system (buttons, forms, icons, layout, modals, tables, theme). Public ones are barrel-exported from [index.ts](index.ts); import them as `@/components`. Each sub-area pairs a component with a `types.ts`.
- **`icons/`** — ~45 raw SVG components (one per glyph), each a default export taking `IconComponentProps` (`size`, `color`, `weight: "default" | "bold"`, `filled`, `className`). They are **not** used directly; they're registered in [ui/icons/index.ts](ui/icons/index.ts) and rendered by name through the [Icon](ui/icons/Icon.tsx) resolver (see below).
- **`shared/`** — surface-agnostic building blocks reused by dashboard *and* sidebar: the presentational `time-entries/` table + `columns/` cells + `TimeEntryTableConfigs` factories, form fields, the row menu, plus `hooks/` (`useTimeEntryForm`, `useTimeEntries`, `useModal`, `useTimeEntryPermissions`) and `utils/` (`formatters`, `validators`, `themeBridge`).
- **`dashboard/`**, **`sidebar/`** — components for the two main monday widget surfaces. They compose `shared/` + `ui/` pieces (e.g. both feed column configs into the same `shared` `TimeEntryTable`).
- **`features/timer/`** — the live timer feature: `TimerProvider` → `TimerContext` → `useTimer` hook → `TimerContainer`/`TimerControls`/`TimerDisplay`/`TimerComment`.
- Top-level: `Logo`, `Icon` (re-export), `ManualTimeEntryButton`, `TaskItemSelector` (large monday item/subitem picker), `StoreProvider` (rehydrates persisted Zustand stores client-side), `ToastProvider`.

## ⚠️ Active vs. dead code

Several `features/` subtrees are scaffolding that **nothing imports** — don't extend them or assume they're wired in. Verified by import graph:

- **Dead:** `features/admin/*`, `features/time-entries/*` (the components — only the CSS modules under `styles/features/time-entries/` are still referenced), `features/dashboard/{DashboardGrid,DashboardHeader,DashboardLayout}` + its `index.ts` barrel, and `shared/hooks/useTimer.ts` (a stub with empty `start`/`pause`/`saveAsDraft` bodies).
- **Active timer path:** `app` → `features/timer/TimerProvider` and `features/dashboard/timer/TimerDashboardHeader`. `TimerDashboardHeader` is the real composition root — it pulls `TimerContainer`, `features/timer/ManualTimeEntryModal`, `dashboard/SaveTimerModal`, `dashboard/EmptyCommentConfirmationModal`, `Logo`, `ManualTimeEntryButton`.

There are **two `useTimer` hooks**. The real one is [features/timer/hooks/useTimer.ts](features/timer/hooks/useTimer.ts) (~600 lines: session load, Supabase realtime sync, 1s tick, comment auto-save, all timer API calls). The `shared/hooks/useTimer.ts` one is the dead stub. Always use the feature one.

Before building on any `features/*` component, grep for its importers first.

## Design-system conventions

- **Wrap Mantine, don't replace it.** Each `ui/` component spreads through to its Mantine counterpart and adds DS affordances. [Button](ui/buttons/Button.tsx) appends a `button--<variant>` class (default `primary`); `iconLeft`/`iconRight` map to Mantine's `leftSection`/`rightSection`. `IconButton` uses a `colorVariant` enum instead.
- **Icons are rendered by string name**, not imported per-use: `<Icon name="play" />`. The `name` must be a key exported from [ui/icons/index.ts](ui/icons/index.ts) (camelCase, e.g. `arrowBack`, `checkCircle`); unknown names `console.warn` and render `null`. When adding an icon: create the SVG in `icons/` (mirror an existing one's `weight` switch + `IconComponentProps`), then register it in the barrel.
- **Theme tokens** are defined once in [ui/theme/tokens.ts](ui/theme/tokens.ts) as a Mantine `CSSVariablesResolver` and consumed as CSS vars (`var(--color--…)`, `var(--font--…)`, `var(--border-radius--…)`). Semantic tokens resolve to different ramp steps per scheme, so the same markup is correct in light/dark/black. Don't hardcode colors; add a token. To read a token's value in JS (numeric breakpoints/spacing, canvas, third-party libs) use [shared/utils/themeBridge.ts](shared/utils/themeBridge.ts) (`getNumber`/`getColor`/`getSpacing`), which caches `getComputedStyle` reads.

## Styling

CSS lives in a **separate mirror tree** under [styles/](styles/) (`styles/ui/...`, `styles/features/...`), not co-located with components, as `.module.css`. Two import patterns coexist — match the file you're editing:

1. **Side-effect import + global class strings** (most of `ui/`): `import "@/components/styles/ui/buttons/Button.module.css";` then `className="button button--primary"`. The module's class names are global, not hashed.
2. **CSS-module object** (modals, feature/shared components): `import styles from "..."` then `className={styles.timeEntryTable}`.

## The table system

Time-entry tables are data-driven. The presentational [shared/time-entries/TimeEntryTable.tsx](shared/time-entries/TimeEntryTable.tsx) renders whatever `ColumnDef<TimeEntry>[]` it's given (it defines no columns itself); column sets come from `getDashboardColumns` / `getSidebarColumns` in `TimeEntryTableConfigs`, with cell renderers in `columns/`. It handles loading/error/empty states, draft-row highlight (`entry.timer_state !== "finalized"`), and select-all checkbox state. To change what a table shows, edit the config/columns, not the table. Note `duration` on a `TimeEntry` is in **seconds**; form hooks work in `"HH:MM"` local-time strings (see `useTimeEntryForm`).

## State, data, and side effects

- Components **don't fetch** — they read Zustand stores (`@/stores/*`) and the `shared/hooks`. Kick off fetches from `useEffect`. See root CLAUDE.md for the store map.
- The timer subtree gets its state via React Context (`TimerProvider` exposes the `useTimer` result through `@/contexts/TimerContext`; consume with `useTimerContext`). This is the one place the app uses Context over Zustand for component state.
- **Permissions are pure ownership**: [useTimeEntryPermissions](shared/hooks/useTimeEntryPermissions.ts) grants edit/delete/bulk-select only when `entry.user_id === currentUserId` (the internal Supabase id). Admin elevation is enforced at API routes, not here.
- **Toasts**: `useToast().showToast(message, type?, duration?, action?)` from [ToastProvider](ToastProvider.tsx); types map to Mantine notification colors.

## Gotchas

- Add `"use client"` to any interactive component (hooks, event handlers, Mantine). The `icons/` SVGs are intentionally server-safe and omit it.
- **All user-facing copy is German, by policy** (the app is for a German audience). Code, comments, JSDoc, and identifiers stay in English — only the displayed string *values* are German (e.g. `"Keine Zeiteinträge gefunden."`). There is intentionally **no i18n layer**: strings are hardcoded inline at their usage sites, so when adding UI, write German copy directly and match existing terminology/register (the codebase mixes formal *Sie* and neutral imperatives — prefer the neutral imperative for new copy unless the surrounding screen uses *Sie*).
- Several `index.ts` / `types/` files are deliberately empty placeholders (e.g. `components/types/ui.ts`) — cross-component types live in `@/types`, not here.
