// lib/supabase/server.ts
// Server-side Supabase client — service-role key, bypasses RLS.
// NEVER import this file into client (browser) code. All authoritative DB
// reads and writes go through supabaseAdmin exported here.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.NEXT_SUPABASE_SECRET_KEY!;

/**
 * Service-role Supabase client for **all server-side database access**.
 *
 * Authenticated with `NEXT_SUPABASE_SECRET_KEY` (the service-role key), which
 * **bypasses Row-Level Security** entirely. This is intentional — this app's
 * auth model is monday.com JWT sessions, not Supabase auth, so RLS policies
 * are not enforced at the DB level; access control lives at the API route
 * layer (`verifyMondayJwt` + ownership checks).
 *
 * Session persistence and token auto-refresh are disabled because this client
 * is a long-lived server singleton, not a per-user browser session.
 *
 * **Never import into client-side code** (`app/` React components, Zustand
 * stores, etc.). For browser real-time subscriptions use the anon `supabase`
 * client from `lib/supabase/client.ts`.
 *
 * @example
 * ```ts
 * import { supabaseAdmin } from "@/lib/supabase/server";
 *
 * const { data, error } = await supabaseAdmin
 *   .from("time_entry")
 *   .select("*")
 *   .eq("user_id", userProfile.id);
 * ```
 */
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});
