import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// IMPORTANT: Use environment variables for production.
export const supabaseUrl = "https://wwqbgosqxqeampdgtrtz.supabase.co";
export const supabaseAnonKey = "sb_publishable_6f-o4NnKqYHBciTNjFrm5w_PtL99WBA";

export const sheetBestUrl = "https://api.sheetbest.com/sheets/de4ff39e-0acd-44f5-9e3a-d23bb6ccb24b";

export let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
}
