# Spec: Time-lock enhancement for time-entry modals

## Overview

The time-entry modals let users edit a `start time`, `end time`, and `duration`, kept
mutually consistent (`end = start + duration`). Today there is a single end-time
**lock** (a boolean `isLocked`) that pins/“live-tracks” the end time. This feature
generalizes that into **three explicit locks** — start, end, and duration — built
around an *anchor* model:

- The **start-lock** and **end-lock** are mutually-exclusive *anchors*: the locked
  time is the fixed reference the other fields are computed against.
- A new **duration-lock** freezes the duration so the start/end window can be slid
  as a unit.
- **End-lock is the default** when a fresh entry or an active-timer finalize is
  opened, because users rarely track time into the future. To track forward, the
  user locks the **start** instead.

The lock semantics change in one important way: **a lock pins a field to its current
value, it does not advance it to “now.”** The old 10-second live-tick is removed.
“Now” is produced only by (a) the default value when a brand-new entry / active-timer
finalize is opened, and (b) the existing per-field “now” button.

All four modals are unified on the shared `useTimeEntryForm` hook +
`TimeEntryFormFields` component; `SaveTimerModal`’s duplicated copy of the lock/sync
logic is removed in favor of the shared implementation.

## Goals

- Replace the single `isLocked` end-time lock with three locks: start, end, duration.
- Default the **end-lock on** for new-entry and active-timer-finalize modals.
- Add a **start-lock** so users can anchor the start and extend the end into the future.
- Add a **duration-lock** that freezes duration and lets the start/end window slide;
  only activatable when a start- or end-anchor is present.
- Disable the duration input **and** the quick-adjust buttons while duration is locked.
- Remove the 10-second live-tick; locks pin values, “now” is explicit.
- Refactor `SaveTimerModal` onto the shared `useTimeEntryForm` / `TimeEntryFormFields`.
- German UI copy, English code (per repo policy).

## Non-goals

- No change to the API payloads, DB schema, or RPC functions. Times/durations are
  still sent as before (`duration` in seconds, start/end as ISO 8601).
- No multi-day / cross-midnight entry support beyond what exists today (the `"HH:MM"`
  helpers wrap at 24h; the single `date` field is unchanged).
- No persistence of lock state across modal opens (locks reset to the per-modal
  default each time the modal opens).
- No change to permissions, optimistic-concurrency, or save flows.

## Domain model: the state machine

Two pieces of lock state replace the old `isLocked` boolean:

```ts
type Anchor = "none" | "start" | "end";   // mutually-exclusive time anchor
durationLocked: boolean;                    // requires anchor !== "none"
```

Invariants:

- At most one time anchor (`"start"` **xor** `"end"`, or `"none"`).
- `durationLocked` may be `true` **only** when `anchor !== "none"`.
- The form value relationship `end = start + duration` always holds (clamped at 0;
  arithmetic wraps at 24h via the existing `lib/time` helpers).

### Disabled-state matrix (derived from lock state)

| Field            | Disabled when                                  |
| ---------------- | ---------------------------------------------- |
| start input      | `anchor === "start" && !durationLocked`        |
| end input        | `anchor === "end" && !durationLocked`          |
| duration input   | `durationLocked`                               |
| quick-adjust btns| `durationLocked`                               |
| “now” buttons    | never (override read-only; see below)          |
| duration-lock btn| not clickable when `anchor === "none"`         |

Key consequence: turning **duration-lock on lifts the disable on the anchor time
field** (the anchor field becomes editable) and disables the duration field instead —
this is what allows “both times editable, window slides.”

### Interaction rules

Let `now = getCurrentTimeString()`. All arithmetic uses the existing helpers
(`durationToSeconds`, `secondsToDuration`, `addSecondsToTimeString`,
`subtractSecondsFromTimeString`, `calculateDurationBetweenTimes`, clamped via
`Math.max(0, …)`).

**Lock toggles**

- `toggleStartLock()`:
  - if `anchor === "start"` → `anchor = "none"`, `durationLocked = false`.
  - else → `anchor = "start"` (clears any end-lock). Values unchanged.
- `toggleEndLock()`: symmetric to the above with `"end"`.
- `toggleDurationLock()`:
  - no-op when `anchor === "none"` (button is disabled).
  - else → `durationLocked = !durationLocked`. Values unchanged.

**Editing a time field** (only reachable when that input is enabled):

- `handleStartTimeChange(val)`:
  - if `durationLocked` → `end = start + duration` (slide; duration unchanged).
  - else → `duration = end − start` (recompute; end unchanged).
  - `anchor` unchanged (no auto-unlock).
- `handleEndTimeChange(val)`: symmetric:
  - if `durationLocked` → `start = end − duration`.
  - else → `duration = end − start`.
  - `anchor` unchanged.

**Editing duration** (only reachable when duration input is enabled, i.e. `!durationLocked`):

- `handleDurationChange(val)` / `adjustDuration(minutes)`:
  - `anchor === "end"` → `start = end − duration` (end fixed; start moves into past).
  - `anchor === "start"` → `end = start + duration` (start fixed; end moves into future).
  - `anchor === "none"` → `end = start + duration` (free default: keep start, move end).
  - `anchor` unchanged.

**“Now” buttons** (always enabled — they override the read-only state and do **not**
clear the lock):

- `handleStartTimeNow()`: `start = now`, then:
  - if `durationLocked` → `end = start + duration`.
  - else → `duration = end − start` (keep end).
  - `anchor` unchanged (e.g. start-locked stays start-locked).
- `handleEndTimeNow()`: `end = now`, then:
  - if `durationLocked` → `start = end − duration`.
  - else → `duration = end − start` (keep start).
  - `anchor` unchanged.

> Rationale: making the anchor field read-only is what makes start-lock behave
> differently from the free state — otherwise locking the start would be
> indistinguishable from no anchor. The “now” button is the explicit escape hatch to
> change the locked field’s value without unlocking it.

## Technical design

### Files touched

| File | Change |
| ---- | ------ |
| `components/shared/hooks/useTimeEntryForm.ts` | Core rewrite: replace `isLocked`/`toggleLock`/`initialIsLocked` with the `anchor` + `durationLocked` state machine; **remove** the live-tick `useEffect` and the now-unused `isEnabled` option; update the duration-sync effect; add `toggleStartLock`/`toggleEndLock`/`toggleDurationLock`; update `reset` signature. |
| `components/shared/time-entries/TimeEntryFormFields.tsx` | Replace `isLocked`/`onLockToggle` props with `startLocked`/`endLocked`/`durationLocked` + their toggle callbacks; add start-lock button (`rightSection` of start input), keep end-lock button, add duration-lock button (`rightSection` of duration input); compute disabled states from the matrix; disable quick-adjust buttons when `durationLocked`; add tooltips. |
| `components/features/timer/ManualTimeEntryModal.tsx` | Default `anchor = "end"`; pass the new lock props through. |
| `components/sidebar/ItemManualEntryModal.tsx` | Default `anchor = "end"` (was `initialIsLocked: true`); pass the new lock props. |
| `components/dashboard/EditTimeEntryModal.tsx` | Default `anchor = "none"` (free, no tick — preserves historical times); pass the new lock props. |
| `components/dashboard/SaveTimerModal.tsx` | **Refactor** onto `useTimeEntryForm` + `TimeEntryFormFields`; delete its local time/lock state, sync effects, and bespoke handlers. Preserve its two modes (live timer vs reopened draft) and its special comment wiring. |
| `components/CLAUDE.md` (optional) | Update the `useTimeEntryForm` description if it documents `isLocked`. |

No API/route/DB/RPC changes.

### `useTimeEntryForm` — new shape

```ts
export type TimeAnchor = "none" | "start" | "end";

export interface UseTimeEntryFormOptions {
  initialValues?: Partial<TimeEntryFormValues>;
  onValuesChange?: (values: TimeEntryFormValues) => void;
  initialAnchor?: TimeAnchor;          // default "none"
  initialDurationLocked?: boolean;     // default false (ignored if initialAnchor === "none")
}

// returns
{
  values: TimeEntryFormValues;
  anchor: TimeAnchor;
  durationLocked: boolean;
  handlers: {
    setDate; setComment;
    handleStartTimeChange; handleEndTimeChange;
    handleDurationChange; adjustDuration;
    handleStartTimeNow; handleEndTimeNow;
    toggleStartLock; toggleEndLock; toggleDurationLock;
    reset; // reset(newValues, newAnchor?, newDurationLocked?)
  };
}
```

- The `updateSource` ref guard pattern is kept to prevent feedback loops between the
  duration-sync effect and the time/duration setters; the `"lock"` source (used only
  by the removed live-tick) is dropped.
- The duration-sync `useEffect` is updated to branch on `anchor` (`"end"` → move
  start, `"start"`/`"none"` → move end) instead of the old `isLocked` boolean, and no
  longer runs on a timer.
- `reset` clears/overrides `anchor` and `durationLocked` when the optional args are
  provided, and continues to bypass the sync effect for one cycle.

### `TimeEntryFormFields` — new props

Replace:

```ts
isLocked: boolean;
onLockToggle: () => void;
```

with:

```ts
startLocked: boolean;
endLocked: boolean;
durationLocked: boolean;
onStartLockToggle: () => void;
onEndLockToggle: () => void;
onDurationLockToggle: () => void;
```

The component derives `disabled` per the matrix and renders three lock `IconButton`s
in the right sections (start input, end input, duration input), reusing the existing
`lock`/`unlock` icons and `colorVariant` styling (`primary` when active, `tertiary`
otherwise). Quick-adjust `Button`s get `disabled={durationLocked}`. The greyed
“disabled” input styling currently applied to the locked end input is generalized to
whichever field is disabled (anchor time field, or duration when duration-locked).

### `SaveTimerModal` refactor notes

- Drive `date / startTime / endTime / duration / anchor / durationLocked` from
  `useTimeEntryForm`; render via `TimeEntryFormFields` (with `taskSelector` =
  `TaskItemSelector` and `quickAdjustments` matching the other modals).
- **Comment stays special:** keep the existing global-vs-local comment logic
  (`useTimerStore` comment + autosave when live, `localComment` when reopening a
  draft). Wire it through `TimeEntryFormFields`’ `comment` / `onCommentChange` props;
  the hook’s own `comment` is unused here.
- **Open (`useEffect` on `show`)** calls `handlers.reset(...)`:
  - Live timer (no `initialData`): `duration = secondsToDuration(roundDuration(elapsed/1000))`,
    `end = now`, `start = end − duration`, `anchor = "end"`, `durationLocked = false`.
  - Reopened draft **with** stored times: `start/end/duration/date` from `initialData`,
    `anchor = "none"`, `durationLocked = false` (preserve historical times, no tick).
  - Reopened draft **without** stored times: `end = now`, `anchor = "end"`.
- **Save** keeps deriving `endTimeIso` from `start + duration` (in seconds) so it can
  never invert / handles midnight, exactly as today. Timer soft-reset + `resetTimer()`
  behavior on the live path is unchanged.

## UI / UX

### Lock buttons & tooltips (German)

- Start input `rightSection`: lock `IconButton`.
  - Tooltip: `"Startzeit sperren"` when unlocked, `"Startzeit entsperren"` when locked.
- End input `rightSection`: lock `IconButton` (existing).
  - Tooltip: `"Endzeit sperren"` / `"Endzeit entsperren"`.
- Duration input `rightSection`: lock `IconButton` (new).
  - Tooltip: `"Dauer sperren"` / `"Dauer entsperren"`.
  - When `anchor === "none"`: disabled, tooltip `"Erst Start- oder Endzeit sperren"`.
- Icon: `lock` when active, `unlock` when inactive; `colorVariant` `primary` (active)
  vs `tertiary` (inactive), matching the current end-lock button.
- The existing per-field **“now”** (`today` icon) buttons in `leftSection` are kept and
  remain enabled even when the field is read-only.

### Visual states

- A read-only (anchor) time field uses the existing greyed/disabled input styling
  (`background-disabled`, transparent border).
- When duration is locked: the duration input shows the same greyed/disabled styling,
  quick-adjust buttons are visibly disabled, and both time inputs are editable.

### Default state per surface

| Modal | Default on open |
| ----- | --------------- |
| `ManualTimeEntryModal` (new entry) | `anchor = "end"`, `durationLocked = false`, `end = now` |
| `ItemManualEntryModal` (new entry) | `anchor = "end"`, `durationLocked = false`, `end = now` |
| `SaveTimerModal` (live timer) | `anchor = "end"`, `durationLocked = false`, `end = now`, duration = elapsed |
| `SaveTimerModal` (reopened draft, stored times) | `anchor = "none"`, stored times preserved |
| `EditTimeEntryModal` (existing entry) | `anchor = "none"`, stored times preserved |

### Flows

- **Track normally (default):** modal opens end-locked; user types a duration → start
  moves into the past; end stays at its (now) value. End field read-only; change via
  its “now” button if needed.
- **Track into the future:** user clicks the start-lock (end-lock clears). Now editing
  duration pushes the end forward; start field read-only (change via its “now” button).
- **Freeze duration / slide window:** with an anchor set, user clicks duration-lock.
  Duration input + quick buttons disable; both times become editable; editing either
  slides the other to keep the duration. Clicking the active anchor off also clears
  duration-lock.

## Edge cases & error handling

- **Duration-lock without an anchor:** button disabled; `toggleDurationLock()` is a
  no-op. If the active anchor is toggled off while duration is locked, duration-lock is
  cleared in the same action.
- **Switching anchor while duration-locked:** allowed (e.g. end-lock → start-lock); an
  anchor is still present so `durationLocked` stays true; values unchanged.
- **Negative / inverted intervals:** durations clamp to `0` (`Math.max(0, …)`), as
  today. A zero duration still blocks save with `"Bitte gib eine Dauer an"` (existing
  validation, unchanged).
- **Midnight wraparound:** `"HH:MM"` helpers wrap at 24h; the single `date` field is
  unchanged, so a window sliding past midnight is not represented as a multi-day entry
  (pre-existing limitation, not addressed here). `SaveTimerModal` continues to derive
  the saved end from `start + duration` for midnight-safe persistence.
- **“Now” on a locked field:** updates that field to the current time and recomputes
  per the rules above **without** clearing the lock.
- **Reopening a historical entry (Edit / draft with stored times):** opens free with no
  tick so the stored start/end are never silently overwritten by “now.”
- **Modal re-open:** lock state always resets to the per-modal default; nothing
  persists between opens.

## Decisions & tradeoffs

1. **Anchor model with a “free” (no-anchor) state** — chosen over “always exactly one
   anchor.” Makes the “duration-lock requires an anchor” rule meaningful and matches
   today’s unlocked behavior for the Edit modal. Rejected: independent start/end locks
   (over-constrains the form).
2. **Duration-lock = “window slides, both editable”** — chosen over “anchor drives,
   other field read-only.” The anchor is the precondition/gate; once duration is
   frozen, editing either time slides the other. Matches the user’s mental model.
3. **Locked field is read-only** — required so start-lock differs from the free state.
   The “now” button is the explicit override that changes a locked field without
   unlocking it.
4. **No live-tick** — locks pin the *current* value rather than ticking to “now.” “Now”
   is only the open-time default (new entry / active timer) and the “now” button. The
   old 10s `setInterval` is removed (and the `isEnabled` option with it).
5. **Editing a non-anchor time keeps the anchor** — no surprise auto-unlock, since
   locks are now explicit, user-controlled buttons.
6. **Refactor `SaveTimerModal` onto the shared hook** — chosen over leaving it
   diverged or duplicating the new logic. Single source of truth for the (now more
   complex) lock behavior; preserves its live/draft modes and comment wiring.
7. **Edit modal default = free** — chosen over end-locked, to avoid clobbering a
   historical entry’s end time.

## Assumptions

- The `isEnabled` option on `useTimeEntryForm` (which only gated the removed live-tick)
  is dropped; callers stop passing it.
- Quick-adjust button sets and the `+15m/+30m/+1h/+2h / -15m/-1h` config are unchanged.
- No analytics/telemetry on lock usage is required.
- Verification is `npm run build` (typecheck gate); there is no test runner.

## Open questions

- None.

## Implementation plan

- [ ] **1. Rewrite `useTimeEntryForm`**: introduce `anchor` (`"none"|"start"|"end"`) and
  `durationLocked` state; remove `isLocked`, `toggleLock`, `initialIsLocked`,
  `isEnabled`, and the live-tick `useEffect`. Add `initialAnchor` / `initialDurationLocked`.
- [ ] **2.** Update the duration-sync effect to branch on `anchor`; keep the
  `updateSource` guard (drop the `"lock"` source).
- [ ] **3.** Implement `handleStartTimeChange` / `handleEndTimeChange` /
  `handleDurationChange` / `adjustDuration` / `handleStartTimeNow` /
  `handleEndTimeNow` per the interaction rules (duration-locked vs not, keep anchor).
- [ ] **4.** Implement `toggleStartLock` / `toggleEndLock` / `toggleDurationLock`
  (mutual exclusion + duration-lock gating + auto-clear duration-lock when anchor clears).
- [ ] **5.** Update `reset(newValues, newAnchor?, newDurationLocked?)`.
- [ ] **6. Update `TimeEntryFormFields`**: new lock props; render start/end/duration
  lock buttons in right sections; compute disabled states; disable quick-adjust when
  duration-locked; add German tooltips; generalize the disabled-input styling.
- [ ] **7. `ManualTimeEntryModal`**: pass `initialAnchor: "end"` and the new lock
  props/handlers; keep `end = now` reset on open.
- [ ] **8. `ItemManualEntryModal`**: same as above (was `initialIsLocked: true`).
- [ ] **9. `EditTimeEntryModal`**: `initialAnchor: "none"`; reset with
  `anchor = "none"`; pass the new lock props/handlers.
- [ ] **10. Refactor `SaveTimerModal`**: replace local time/lock state + handlers with
  `useTimeEntryForm`; render `TimeEntryFormFields`; preserve live-timer vs draft-reopen
  open logic (anchors per the table), comment wiring, and the `start + duration` save
  derivation + timer soft-reset.
- [ ] **11.** Grep for any remaining `isLocked` / `onLockToggle` / `toggleLock` /
  `initialIsLocked` usages and update them.
- [ ] **12.** Update JSDoc on `useTimeEntryForm` / `TimeEntryFormFields` (and
  `components/CLAUDE.md` if it references `isLocked`).
- [ ] **13.** `npm run build` to typecheck; manually verify each modal’s default,
  anchor switching, duration-lock window-slide, “now” buttons, and Edit/draft preserve
  historical times.
```
