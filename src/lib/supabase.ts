import { createClient } from "@supabase/supabase-js";

// Make sure to set these in the AI Studio environment variables / Secrets panel!
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
