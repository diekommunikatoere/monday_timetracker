import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.NEXT_SUPABASE_SECRET_KEY!;

console.log("Supabase URL:", supabaseUrl);
console.log("Supabase Service Role Key:", supabaseServiceKey);

export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});
