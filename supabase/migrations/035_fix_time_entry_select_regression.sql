-- Migration: 035_fix_time_entry_select_regression.sql
-- Description: Fix a regression introduced by 034_rls_lockdown.sql.
--
-- The time_entry SELECT policy's USING clause was
--   user_id IN (SELECT id FROM user_profiles WHERE id = user_id)
-- which only ever evaluated true because anon could SELECT every row of
-- user_profiles (making the subquery a tautology). 034 removed anon SELECT
-- on user_profiles, so the subquery now returns zero rows for anon and the
-- IN (...) is always false — anon time_entry SELECT silently broke entirely,
-- taking down the cross-device timer realtime subscription
-- (components/features/timer/hooks/useTimer.ts) that 034 intended to preserve.
--
-- Fix: express the same "keep time_entry fully readable" intent directly,
-- without a cross-table dependency on user_profiles' now-locked-down RLS.
DROP POLICY IF EXISTS "Users can view own time entries" ON public.time_entry;

CREATE POLICY "Users can view own time entries"
    ON public.time_entry FOR SELECT
    USING (true);
