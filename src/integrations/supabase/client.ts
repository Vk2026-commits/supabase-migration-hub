import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Point these at your own Supabase project via VITE_SUPABASE_URL and
// VITE_SUPABASE_PUBLISHABLE_KEY. Placeholders keep the UI renderable
// before the project is connected.
const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] ?? "https://placeholder.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ?? "public-anon-key-placeholder";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
