-- Migration: 024_timer_backfill.sql
-- Wave 1 (data only) of the timer 2-table redesign — see docs/timer-redesign.md §6.
--
-- Rollout is Option 1 (drain window): the team stops starting timers, and by the time this
-- runs all live timers have been finalized/saved, so timer_session (and timer_segment, which
-- cascades from it) is empty. The backfill then reduces to mapping the discriminator and
-- PRESERVING saved-as-draft ("parked") entries.
--
-- Do NOT clean-slate (`DELETE FROM time_entry WHERE is_draft = true`) — that would delete the
-- team's saved-as-draft entries. If the drain is incomplete, finalize the stray timer or use
-- the §6 fallback (map running/paused, re-parent segments, dedup) instead of this file.

-- Safety guard: refuse to run if the drain isn't actually complete, otherwise live
-- running/paused timers would be silently mis-mapped to 'parked'.
DO $$
DECLARE
    v_live int;
BEGIN
    SELECT count(*) INTO v_live FROM public.timer_session;
    IF v_live > 0 THEN
        RAISE EXCEPTION
            'Timer drain incomplete: % active timer_session row(s). Finalize them or apply the docs/timer-redesign.md section 6 fallback before running 024.',
            v_live;
    END IF;
END $$;

-- Map the discriminator. WHERE timer_state IS NULL keeps this idempotent.
UPDATE public.time_entry SET timer_state = 'finalized' WHERE is_draft = false AND timer_state IS NULL;
UPDATE public.time_entry SET timer_state = 'parked'    WHERE is_draft = true  AND timer_state IS NULL;
