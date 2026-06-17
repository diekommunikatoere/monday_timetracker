// lib/supabase/client.ts
// Browser-side Supabase client — anon key only. Use exclusively for real-time
// subscriptions. All DB reads and writes must go through supabaseAdmin in
// lib/supabase/server.ts which bypasses RLS.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

/**
 * Anon-key Supabase client for **client-side real-time subscriptions only**.
 *
 * Authenticated with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (the anon
 * key), so it is subject to Row-Level Security policies and **must not** be
 * used for authoritative reads or writes. Those must go through
 * {@link supabaseAdmin} in `lib/supabase/server.ts`, which uses the
 * service-role key and bypasses RLS.
 *
 * **Never import this into server-side code** (`app/api/`, `lib/database.ts`,
 * etc.) — the service-role client is required there.
 *
 * Typical usage: subscribe to `timer_session` changes so the timer UI syncs
 * across devices in real time.
 *
 * @example
 * ```ts
 * import { supabase } from "@/lib/supabase/client";
 *
 * supabase
 *   .channel("timer-session")
 *   .on("postgres_changes", { event: "*", schema: "public", table: "timer_session" }, handler)
 *   .subscribe();
 * ```
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
