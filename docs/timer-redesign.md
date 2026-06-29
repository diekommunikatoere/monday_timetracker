# Timer subsystem redesign — design doc

**Status:** proposal (decisions O1–O5 resolved) · **Scope:** timer + time-entry lifecycle only · **Phase:** changes are applied **directly to the production database** behind a timer-drain window (Option 1): backward-compatible migrations run live, breaking ones in a short deploy window (§5–§6). Take a database backup/snapshot before the breaking wave (Appendix A).

**Goal:** make the timer subsystem robust and maintainable by (1) making every state transition a single atomic Postgres RPC, (2) collapsing the 3-table model to 2 tables with a single source of truth, and (3) making illegal states unrepresentable via constraints. Forward-compatible with a future "multiple timers, one running" feature (not built now).

**Non-goals / leave untouched:** `user_profiles`, `role`, `board_config` / column-sync config, the monday mirror tables (`monday_board` / `monday_item` / `monday_column`), the soft-delete lifecycle, and column sync (only its `is_draft` filters change — see O3).

---

## Resolved decisions

- **O1 — keep `paused` and `parked` distinct.** Four-value `timer_state` enum. "Save as draft" (`parked`) stays a separate user action from "pause."
- **O2 — start-while-running shows a confirm dialog.** Starting a new timer while one is running prompts: *"another timer is running and will be paused."* On confirm, the existing running timer is **paused** (preserved, not discarded) and the new one starts. The RPC does this atomically; the client gates it behind the dialog. Multi-timer UI is out of scope for now — see §8 note on where the paused timer surfaces until then.
- **O3 — remove `is_draft` entirely.** `timer_state` is the sole discriminator (`finalized` ⇄ old `is_draft = false`). Requires recreating the views/functions and updating the TS that reference `is_draft` (impact list in §2.1).
- **O4 — the `time_entry.timer_session` jsonb column is safe to drop.** It is written at finalize and surfaced by the item-time-entries views, but **no active client code reads it** (only the generated DB type and the dead `components/shared/hooks/useTimer.ts` stub mention the name). Dropped as part of recreating those views + finalize.
- **O5 — split migrations** into ordered files (§5) for review clarity and controlled ordering.
- **Rollout — Option 1 (drain window), applied directly to production.** The team stops starting timers; once `timer_session` is empty, the backward-compatible wave (`023`–`026`) runs live and the breaking wave (`027`–`028`) runs in a short window with the new-code deploy (§5–§6).

---

## 1. Current state (summary)

**Tables:** `time_entry` (durable record, `is_draft = true` while live) → `timer_session` (≈ one per user, holds `elapsed_time` / `is_paused` / `draft_id`) → `timer_segment` (run intervals, `end_time IS NULL` = running).

**Key mechanisms & their faults (all confirmed in code):**

- **Non-atomic, multi-call transitions.** `startTimer` = 3 separate inserts ([lib/database.ts:657-690](../lib/database.ts#L657-L690)); save = `finalize` RPC **+ a separate** `soft-reset` call ([SaveTimerModal.tsx:175-211](../components/dashboard/SaveTimerModal.tsx#L175-L211)); draft auto-save = insert **+ separate** link update ([app/api/timer/draft/route.ts:55-72](../app/api/timer/draft/route.ts#L55-L72)). An interruption between steps orphans rows. This is the reported bug.
- **Ambiguous ownership.** The only link is `timer_session.draft_id → time_entry` with `ON DELETE SET NULL` ([002_tables.sql:89](../supabase/migrations/002_tables.sql#L89)). `clearTimerSession` deletes the *draft* expecting a cascade that doesn't exist, so the session survives with `draft_id = NULL` ([lib/database.ts:609-624](../lib/database.ts#L609-L624)). The entry also **outlives** the session at finalize, so `draft_id` is a misnomer.
- **`finalize_time_entry` does not delete the session** ([022](../supabase/migrations/022_finalize_honor_explicit_times.sql)); it leaves the session pointing at a finalized entry until the follow-up `soft-reset` removes it. If that second call is lost, the leftover (running) session blocks the next start via the partial unique index.
- **Redundant denormalized columns.** `time_entry.timer_session` (jsonb) and `timer_session.timer_segments` (jsonb) duplicate the normalized tables.
- **Implicit states.** "Parked" (Save as draft) = a draft that *happens to have no session row*. Overlapping/duplicate functions: `finalize_draft` → `finalize_time_entry`, an unused `soft_reset_timer`, plus route-level direct deletes.

**Client-side amplifier (part of the fix):** the reset action silently returns when `draftId` is null ([useTimer.ts:484](../components/features/timer/hooks/useTimer.ts#L484)) — no log, no request — which is why the reported failure produced nothing anywhere.

---

## 2. Target model — 2 tables

A timer **is** a draft `time_entry`; its run intervals are `timer_segment` rows that reference the entry **directly**. The `timer_session` table is removed.

### 2.1 `time_entry` (modified, not replaced)

Existing durable columns stay. Changes:

- **Add** `timer_state timer_state NOT NULL` — single source of truth for lifecycle.
- **Drop** `is_draft` (O3) and **drop** the `timer_session` jsonb column (O4).
- **Unchanged:** `start_time`, `end_time`, `duration` (seconds), `comment`, `board_id`, `item_id`, `role_id`, `synced_to_monday`, `deleted_at`, `deleted_by`, `created_at`, `updated_at`. (No `task_name` column exists — task name derives from `monday_item.name`. `parent_item_id` was already dropped in mig 017.)

```sql
CREATE TYPE timer_state AS ENUM ('running', 'paused', 'parked', 'finalized');

-- one RUNNING timer per user (many paused/parked allowed → multi-timer ready)
CREATE UNIQUE INDEX one_running_timer_per_user
    ON public.time_entry(user_id) WHERE timer_state = 'running';

-- a finalized entry must be complete
ALTER TABLE public.time_entry
    ADD CONSTRAINT time_entry_finalized_complete
    CHECK (timer_state <> 'finalized' OR (duration IS NOT NULL AND end_time IS NOT NULL));
```

Lifecycle semantics for the live columns:

| | `timer_state` | `end_time` | `duration` | live elapsed |
|---|---|---|---|---|
| running | `running` | NULL | NULL | computed from segments |
| paused | `paused` | NULL | NULL | computed from segments |
| parked (saved as draft) | `parked` | NULL | NULL | computed from segments |
| finalized | `finalized` | set | set (seconds) | = `duration` |

**O3 blast radius — must be updated when `is_draft` is removed** (`is_draft = false` → `timer_state = 'finalized'`; `is_draft = true` → `timer_state <> 'finalized'`):

- *SQL* (recreate): views `007_item_time_entries` & `020_exclude_trashed_item_time`; column-sync functions `018`; the `idx_time_entry_is_draft` index (005); finalize.
- *TS* (11 files): `types/time-entry.ts`, `types/database/database.ts` (regenerate), `lib/database.ts`, `lib/permissions/timeEntry.ts`, `app/api/time-entries/manual/route.ts` (manual insert → `timer_state='finalized'`), `app/api/sync/board/[boardId]/route.ts`, `app/api/timer/draft/route.ts` (being removed anyway), and the table UI `components/shared/time-entries/{TimeEntryTable,TimeEntryRowMenu,columns/TaskCell}.tsx` + `components/dashboard/TimeEntriesTable.tsx` (draft-row highlight → `timer_state <> 'finalized'`).

### 2.2 `timer_segment` (re-parented)

```sql
entry_id    UUID NOT NULL REFERENCES public.time_entry(id) ON DELETE CASCADE,  -- was session_id
start_time  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
end_time    TIMESTAMPTZ,            -- NULL = running
-- drop the stored `duration` column (jsonb-era); compute end-start instead

CREATE UNIQUE INDEX one_open_segment_per_entry
    ON public.timer_segment(entry_id) WHERE end_time IS NULL;   -- ≤1 running segment per timer
CREATE INDEX idx_timer_segment_entry_end
    ON public.timer_segment(entry_id, end_time NULLS FIRST);
```

**Gone:** the `timer_session` table, `draft_id`, both jsonb snapshot columns, `is_paused`, stored `elapsed_time`, stored segment `duration`, `is_draft`, and `soft_reset_timer` / `finalize_segment` / `get_timer_session_with_elapsed` / `finalize_draft`.

### 2.3 Elapsed time — computed, not stored

```sql
CREATE VIEW public.time_entry_with_elapsed
WITH (security_invoker = on) AS   -- consistent with mig 016 view-security fix
SELECT te.*,
  COALESCE((
    SELECT SUM(EXTRACT(epoch FROM (COALESCE(s.end_time, now()) - s.start_time)))
    FROM public.timer_segment s WHERE s.entry_id = te.id
  ), 0)::int AS elapsed_seconds
FROM public.time_entry te;
```

The running segment is open (`end_time IS NULL`); the client ticks the live second locally between updates.

### 2.4 Realtime & RLS

- Client subscribes to its own non-finalized `time_entry` rows (the tray) and to `timer_segment` for the open-segment start.
- `ALTER TABLE public.time_entry REPLICA IDENTITY FULL`; add `time_entry` to `supabase_realtime`; drop `timer_session` from it. `timer_segment` already `REPLICA IDENTITY FULL` (mig 010).
- Keep RLS on both tables (mig 006). Rewrite `timer_segment` policies to key on `entry_id → time_entry.user_id` (was `session_id → timer_session.user_id`).

---

## 3. State machine

```
            timer_start (confirm dialog if one already running → that one is paused)
   (none) ─────────────────────▶ running ──pause──▶ paused
                                   ▲                   │
                            resume │                   │ resume
                                   └───────────────────┘   (one running per user; resuming
                                                            another pauses the current)
   running/paused ──park──▶ parked ──resume──▶ running
   running/paused/parked ──finalize──▶ finalized   (terminal; durable entry)
   running/paused/parked ──reset──▶ (deleted)
```

- **`paused`** = held; intended to be resumed soon.
- **`parked`** = "Save as draft": set aside as an unfinished draft to finalize/edit manually later. Distinct action and state (O1).
- **`finalized`** = the real, durable time record.

---

## 4. Functions — one atomic RPC per transition

All `SECURITY DEFINER`, single-transaction, take `p_user_id`, enforce ownership. Routes become thin one-call wrappers.

| RPC | Replaces | Behavior (atomic) |
|---|---|---|
| `timer_start(p_user_id, p_board_id?, p_item_id?, p_role_id?) → time_entry` | TS `startTimer` + `clearTimerSession` | Pause any `running` timer for the user (client shows the O2 dialog first); insert `time_entry(timer_state='running')`; open first segment. |
| `timer_pause(p_user_id, p_entry_id)` | `pauseTimer` + `finalize_segment` | Close the open segment; set `paused`. No-op if already paused. |
| `timer_resume(p_user_id, p_entry_id)` | `resumeTimer` | Pause the user's current `running` timer; open a new segment on the target; set `running`. |
| `timer_park(p_user_id, p_entry_id, p_comment?)` | `saveAsDraft` + `soft-reset` | Close any open segment; persist comment; set `parked`. |
| `timer_finalize(p_user_id, p_entry_id, p_task_name, p_comment, p_board_id?, p_item_id?, p_role_id?, p_board_name?, p_item_name?, p_parent_item_id?, p_parent_item_name?, p_duration?, p_start_time?, p_end_time?) → time_entry` | `finalize_time_entry` / `finalize_draft` | Close any open segment; upsert monday dimension rows as today; compute duration (Σ segments, **1–59 s → 60**) unless `p_duration` given; honor explicit `p_start_time`/`p_end_time` (mig 022 logic); set `end_time`, `duration`, `comment`, assignment cols, `timer_state='finalized'`. **No session to delete.** |
| `timer_reset(p_user_id, p_entry_id)` | reset route's two deletes | Delete the entry (segments cascade). |
| `get_active_timers(p_user_id) → setof time_entry_with_elapsed` | `get_timer_session_with_elapsed` + `GET /session` | The tray: `WHERE user_id = p_user_id AND timer_state <> 'finalized' AND deleted_at IS NULL`, with computed `elapsed_seconds`. |

Manual time entry (no timer) = plain insert with `timer_state='finalized'`, `duration` set, no segments.

Sketch of the two carrying the one-running invariant:

```sql
CREATE OR REPLACE FUNCTION public.timer_start(
  p_user_id uuid, p_board_id text DEFAULT NULL,
  p_item_id text DEFAULT NULL, p_role_id uuid DEFAULT NULL
) RETURNS public.time_entry AS $$
DECLARE v_entry public.time_entry;
BEGIN
  -- one running per user: demote the current running timer (UI confirmed via O2 dialog)
  UPDATE public.timer_segment seg SET end_time = now()
   FROM public.time_entry te
   WHERE seg.entry_id = te.id AND te.user_id = p_user_id
     AND te.timer_state = 'running' AND seg.end_time IS NULL;
  UPDATE public.time_entry SET timer_state = 'paused', updated_at = now()
   WHERE user_id = p_user_id AND timer_state = 'running';

  INSERT INTO public.time_entry (user_id, timer_state, board_id, item_id, role_id)
  VALUES (p_user_id, 'running', p_board_id, p_item_id, p_role_id)
  RETURNING * INTO v_entry;

  INSERT INTO public.timer_segment (entry_id) VALUES (v_entry.id);
  RETURN v_entry;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.timer_resume(p_user_id uuid, p_entry_id uuid)
RETURNS public.time_entry AS $$
DECLARE v_entry public.time_entry;
BEGIN
  UPDATE public.timer_segment seg SET end_time = now()
   FROM public.time_entry te
   WHERE seg.entry_id = te.id AND te.user_id = p_user_id
     AND te.timer_state = 'running' AND te.id <> p_entry_id AND seg.end_time IS NULL;
  UPDATE public.time_entry SET timer_state = 'paused', updated_at = now()
   WHERE user_id = p_user_id AND timer_state = 'running' AND id <> p_entry_id;

  UPDATE public.time_entry SET timer_state = 'running', updated_at = now()
   WHERE id = p_entry_id AND user_id = p_user_id AND timer_state IN ('paused','parked')
   RETURNING * INTO v_entry;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timer not found, not owned, or not resumable'; END IF;

  INSERT INTO public.timer_segment (entry_id) VALUES (v_entry.id);
  RETURN v_entry;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. Migrations (split — O5)

Ordered so nothing is dropped while a live object still references it, and grouped into two rollout waves applied directly to production (note after the table).

| File | Purpose | Key statements |
|---|---|---|
| `023_timer_state_enum_and_columns.sql` | additive only | `CREATE TYPE timer_state`; `ALTER TABLE time_entry ADD COLUMN timer_state` (nullable); `ALTER TABLE timer_segment ADD COLUMN entry_id` (nullable, FK→time_entry); `ALTER timer_segment.session_id DROP NOT NULL` (new segments use `entry_id`; column dropped in 027). |
| `024_timer_backfill.sql` | data only | Drained-state backfill: guard that `timer_session` is empty, then map `is_draft`→`timer_state` (`false`→`finalized`, `true`→`parked`), preserving parked entries — §6. Reads `is_draft` here (dropped later). |
| `025_timer_functions.sql` | new RPCs (additive) | Create `timer_start/pause/resume/park/finalize/reset`, `get_active_timers` (§4). Segments use `entry_id`. `timer_finalize` bootstraps missing monday dimension rows with `ON CONFLICT DO NOTHING` (FK-safe, never clobbers webhook-maintained names). Transitional: these also keep `is_draft` consistent (running/paused/parked → default `true`; finalize → `false`) so the legacy `is_draft` filter stays correct until 027. |
| `026_recreate_dependents.sql` | read API forward-compat (live-safe) | Recreate **only** `get_user_time_entries`: add a `timer_state` output (so the new app styles draft rows off `timer_state`) and drop the `time_entry.timer_session` jsonb from the output (O4). **Keeps** the `is_draft` output and changes no `is_draft` filter, so the still-deployed old app keeps working. The filter swap and the dead-function drops can't run while the old app is live → moved to 027/028. |
| `027_timer_constraints_and_drops.sql` | swap + lock down | Final backfill `UPDATE … WHERE timer_state IS NULL` (catches rows the old app wrote during the window); recreate the 5 `is_draft`-filtered read/aggregate funcs (`get_user_time_entries`, `get_item_time_entries`, `get_item_total_time`, `get_item_time_by_role`, `calculate_remaining_budget`) to filter on `timer_state = 'finalized'`; dedup to one running timer/user; `SET NOT NULL` on `timer_state` & `entry_id`; create `time_entry_with_elapsed` view; add unique indexes + the finalized-complete CHECK; **then** `DROP COLUMN` `is_draft`, `time_entry.timer_session`, `timer_segment.session_id`, `timer_segment.duration`, `DROP INDEX idx_time_entry_is_draft`. |
| `028_timer_rls_realtime_drop_session.sql` | finish | Rewrite `timer_segment` RLS to `entry_id`; `REPLICA IDENTITY` + publication changes (§2.4); `DROP FUNCTION` the now-unreferenced legacy timer machinery (`get_timer_session_with_elapsed`, `get_current_elapsed_time`, `finalize_segment`, `soft_reset_timer`, `finalize_draft`, `finalize_time_entry`); `DROP TABLE public.timer_session CASCADE`. |

**Rollout waves (Option 1 — drain window, applied to production).** Precondition: the team has stopped starting timers and `timer_session` is empty (§6).

- **Wave 1 — live-safe (`023`–`026`):** additive or transparent; runs against the live DB while the team keeps adding/editing normal time entries.
- **Wave 2 — breaking (`027`–`028`):** drops `is_draft` and the old tables/functions the deployed app still references. Run with the new-code deploy in a short, announced window during which normal entry add/edit is also paused (a concurrent edit during the `is_draft` drop would error). Zero-downtime variant: keep `is_draft` via a `BEFORE INSERT/UPDATE` trigger deriving it from `timer_state`, deploy, then drop `is_draft` + trigger last.

After 027 lands, regenerate `types/database/` and do the TS changes (§2.1 list), then ship the route/client changes (§8).

---

## 6. Backfill (`024`) — drained state

Rollout is Option 1, so by the time `024` runs the timer is drained: `timer_session` (and `timer_segment`, which cascades with it) is empty. Confirm first, then map the discriminator and **preserve** saved-as-draft entries:

```sql
SELECT count(*) FROM public.timer_session;   -- expect 0
SELECT count(*) FROM public.timer_segment;    -- expect 0

UPDATE public.time_entry SET timer_state = 'finalized' WHERE is_draft = false;
UPDATE public.time_entry SET timer_state = 'parked'    WHERE is_draft = true;  -- saved-as-draft, preserved
```

Do **not** clean-slate with `DELETE FROM time_entry WHERE is_draft = true` — that deletes the team's saved-as-draft (`parked`) entries.

Rows the old app writes *after* `024` (manual entries/edits during the Wave 1 window) land with `is_draft` set but `timer_state` still NULL. That's fine while Wave 1 runs — the read/aggregate funcs still filter on `is_draft`, and `026`'s `get_user_time_entries` derives `timer_state` for display. `027` runs a final `UPDATE … WHERE timer_state IS NULL` (with entry edits paused) to map those before it swaps the filters to `timer_state` and drops `is_draft`.

### Fallback — only if a timer slipped through the drain (counts above ≠ 0): preserve it

```sql
UPDATE public.time_entry SET timer_state = 'finalized' WHERE is_draft = false;
UPDATE public.time_entry SET timer_state = 'parked'    WHERE is_draft = true;   -- default
UPDATE public.time_entry te
   SET timer_state = CASE WHEN ts.is_paused THEN 'paused' ELSE 'running' END
  FROM public.timer_session ts WHERE ts.draft_id = te.id AND te.is_draft = true;

UPDATE public.timer_segment seg SET entry_id = ts.draft_id
  FROM public.timer_session ts WHERE seg.session_id = ts.id AND ts.draft_id IS NOT NULL;
DELETE FROM public.timer_segment WHERE entry_id IS NULL;   -- orphans (the bug data)

-- enforce one running per user (keep most recently updated)
WITH ranked AS (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY updated_at DESC) rn
                FROM public.time_entry WHERE timer_state = 'running')
UPDATE public.time_entry te SET timer_state='paused' FROM ranked r WHERE te.id=r.id AND r.rn>1;

-- enforce one open segment per entry
UPDATE public.timer_segment seg SET end_time = now() FROM public.time_entry te
 WHERE seg.entry_id=te.id AND seg.end_time IS NULL AND te.timer_state <> 'running';
WITH ranked AS (SELECT id, row_number() OVER (PARTITION BY entry_id ORDER BY start_time DESC) rn
                FROM public.timer_segment WHERE end_time IS NULL)
UPDATE public.timer_segment s SET end_time = now() FROM ranked r WHERE s.id=r.id AND r.rn>1;
```

---

## 7. Open items (remaining)

- **U1 — where does a paused timer surface before multi-timer UI exists?** O2 preserves the previous timer as `paused` rather than discarding it, but there's no tray yet. Minimal options for the build phase: surface "you have a paused timer" in the widget and allow resume, or rely on the draft-row in the entries table. Decide during implementation; **no schema impact.**
- **A1 — resolved:** rollout is Option 1 (drain window); `024` uses the drained-state backfill and **preserves** saved-as-draft (`parked`) entries (§6).

---

## 8. Client & route changes (follow-up)

### Done

- **Routes** → one-call wrappers: `POST /api/timer/{start,pause,resume,finalize,park,reset}` and `GET /api/timer` (the active-timer tray, backed by `get_active_timers` — replaces `GET /api/timer/session`; named `/api/timer` rather than the proposed `/active`). `/soft-reset` and the `draft` link-creation route are removed.
- **Comment auto-save retained** via a new **`PATCH /api/timer/comment`** (`{ entryId, comment }`). This replaces the removed `draft` branch: since a live timer *is* a non-finalized `time_entry`, the comment is a direct, ownership-guarded `UPDATE time_entry SET comment` (guarded `timer_state <> 'finalized'`) — **not** a state transition, so no RPC/migration is needed. `useTimer` debounces it 500 ms; realtime on `time_entry` propagates it cross-device. The client treats the server comment as authoritative (clears propagate) unless the local value has unsaved edits (tracked via a last-persisted ref, so an active typer is never clobbered).
- **`useTimer`** ([useTimer.ts](../components/features/timer/hooks/useTimer.ts)): one fetch per action; silent-return guard removed (errors surface); subscribes to the user's `time_entry` rows and re-fetches authoritative state. "Save as draft" = **park** (`/api/timer/park`). The save modal finalizes both the live timer and a reopened draft through `/api/timer/finalize` (no separate soft-reset).
- **Stores** ([timerStore.ts](../stores/timerStore.ts)): persists only the active `entryId` (+ `comment`); no `sessionId`/`draftId` (kills the stale-localStorage "wrong id" deletes). The obsolete `draftStore` and the dead `components/shared/hooks/useTimer.ts` stub were deleted.

### Remaining

- **O2 confirm dialog** before `timer_start` when a running timer already exists. Deferred: the single-timer widget only reaches "start" from idle, and `timer_start` already pauses any running timer atomically — so this only matters once multi-timer / sidebar-start UI lands (needs a `modalStore` flag + modal component).
- **`is_draft` removal** across the ~11 TS files in §2.1 — do this only **after** mig 027 drops the column (it still exists and these files still read it correctly).
- **Realtime publication** — cross-device sync (incl. comment auto-save propagation) needs mig 028 to add `time_entry` to `supabase_realtime`. Until then the subscription is a harmless no-op; same-device persistence works today.
- **Remove the superseded `/api/time-entries/finalize`** route once confirmed unused (already has no callers).
- **Regenerate `types/database/`** after 027 lands.

## 9. Verification

- `npm run build` (type + route-type gate).
- Manual matrix (during the deploy window, before reopening to the team): start → pause → resume → finalize; start → park → resume; start → reset; start a 2nd timer while one runs (→ confirm dialog → first becomes `paused`, only one `running`); kill the network mid-action and confirm no orphans (single-statement RPCs are all-or-nothing); cross-device realtime.
- DB invariants after a fuzz: 0 users with >1 `running`; 0 entries with >1 open segment; 0 segments without an entry.

---

## Appendix A — Production rollout safety & optional rehearsal

The chosen rollout applies changes **directly to production** behind the drain window (§5). The safety net is the drain plus a backup before the destructive wave:

- **Backup before Wave 2 (`027`/`028`).** Supabase Dashboard → Database → Backups (daily backups / Point-in-Time Recovery if enabled), or a manual snapshot. This is your rollback if the breaking wave misbehaves.
- **Wave 1 is low-risk** — additive columns/functions; if something looks wrong, stop before Wave 2 and the old app keeps working.
- **Run Wave 2 when the team is idle** (drain confirmed, entry edits paused), keep it short, and verify the §9 invariants before reopening.

If you would rather rehearse the migrations on a throwaway copy first instead of going straight to prod, three ways, pick by need:

### A1 — Separate Supabase project (recommended; persistent staging)
1. Create a new project in the Supabase dashboard (e.g. `timetracker-staging`), same region.
2. Grab both **direct** connection strings (Dashboard → Project Settings → Database → Connection string → URI, port 5432).
3. Dump prod `public` schema + data and restore into staging:
   ```bash
   pg_dump "postgresql://postgres:[PWD]@db.[PROD_REF].supabase.co:5432/postgres" \
     --schema=public --no-owner --no-privileges --clean --if-exists \
     -f timetracker_copy.sql
   psql "postgresql://postgres:[PWD]@db.[STAGING_REF].supabase.co:5432/postgres" \
     -f timetracker_copy.sql
   ```
   (`--schema=public` skips Supabase-managed schemas (`auth`, `storage`, …) that would conflict; this app's tables all live in `public`. A fresh project already has the default extensions, so `gen_random_uuid()` works.)
   *Supabase-aware alternative:* `supabase db dump -f schema.sql` + `supabase db dump --data-only --use-copy -f data.sql`, then `psql [STAGING_URL] -f schema.sql -f data.sql`.
4. Make a `.env.staging` (copy of `.env.local`) pointing `NEXT_PUBLIC_SUPABASE_URL` + the Supabase keys at staging, and a **separate `REDIS_URL`** (or Redis DB index) so cache doesn't cross-contaminate.
5. Apply the new migrations there: `supabase link --project-ref [STAGING_REF]` then `supabase db push`. Run `npm run build` and exercise the §9 matrix against staging.
6. Only after it's green: take a fresh prod dump as a backup, then `supabase db push` to prod.

### A2 — Local Supabase stack (fast, free, throwaway)
`supabase start` (needs Docker) → `supabase db reset` runs all `supabase/migrations/` against a local Postgres. Load real data with the `pg_dump`/`psql` from A1 pointed at the local connection string. Nothing remote is touched. Best for iterating on the migrations themselves.

### A3 — Supabase Branching (if on Pro + GitHub)
Preview branches spin up an ephemeral DB per PR from your migrations; good for CI-style migration checks. Branches start from migrations (+ seed), not a full data copy, so combine with a seed/dump if you need realistic data.

> **Backup before the breaking wave is mandatory** (see top of this appendix) — that restore point is your rollback.