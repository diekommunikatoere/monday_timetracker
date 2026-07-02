-- Migration: 027_timer_start_single_timer_guard.sql
-- INTERIM guard on top of 025's timer_start.
--
-- 025's timer_start implements the *future* multi-timer behavior: on start it PAUSES any
-- currently running timer for the user and opens a brand-new running one. That behavior is
-- meant to be gated behind a client confirmation dialog ("O2") that does not exist yet. Until
-- it does, calling start while a timer is already active silently demotes the existing timer
-- and spawns a second one (reachable via a stale/offline UI tab or a second device) — not
-- desired yet, since multi-timer support isn't shipped.
--
-- This migration REPLACES the "pause and replace" logic with a hard guard: timer_start now
-- REFUSES to start a new timer when the user already has an ACTIVE one (timer_state IN
-- ('running', 'paused')). A 'parked' entry (saved as draft) is NOT active and does not block a
-- new start. On conflict the function raises 'ACTIVE_TIMER_EXISTS'; the API route maps this to
-- HTTP 409 and the client re-syncs to the existing timer instead of creating a new one.
--
-- REVERT PLAN: when the O2 multi-timer confirm dialog is built, restore 025's pause-and-replace
-- body here (CREATE OR REPLACE public.timer_start) so start-while-active pauses the existing
-- timer and opens a new one again, once the client has explicitly confirmed that with the user.
--
-- This migration is additive/Wave-1-safe: it is a CREATE OR REPLACE of a single function
-- (same signature, return type, and SECURITY DEFINER as 025's timer_start) and drops/alters
-- nothing else.

-- ============================================
-- timer_start — begin a new running timer (single-timer guard, interim)
-- ============================================
-- p_item_id/p_board_id, when supplied, come from a context that has already mirrored the
-- item (e.g. the item sidebar), so the time_entry FK to monday_item/monday_board is satisfied.
CREATE OR REPLACE FUNCTION public.timer_start(
    p_user_id  uuid,
    p_board_id text DEFAULT NULL,
    p_item_id  text DEFAULT NULL,
    p_role_id  uuid DEFAULT NULL
) RETURNS public.time_entry AS $$
DECLARE
    v_entry public.time_entry;
BEGIN
    -- Interim single-timer guard: refuse to start if the user already has an active
    -- (running or paused) timer. 'parked' (saved-as-draft) entries do not block a new start.
    IF EXISTS (
        SELECT 1 FROM public.time_entry
         WHERE user_id = p_user_id
           AND timer_state IN ('running', 'paused')
    ) THEN
        RAISE EXCEPTION 'ACTIVE_TIMER_EXISTS';
    END IF;

    -- New running timer. is_draft defaults TRUE (transitional; dropped in a later migration).
    INSERT INTO public.time_entry (user_id, timer_state, board_id, item_id, role_id)
    VALUES (p_user_id, 'running', p_board_id, p_item_id, p_role_id)
    RETURNING * INTO v_entry;

    -- Open the first segment (end_time NULL = running). session_id stays NULL.
    INSERT INTO public.timer_segment (entry_id) VALUES (v_entry.id);

    RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
