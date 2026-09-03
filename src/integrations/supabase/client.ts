import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { brokeredPreviewStorage } from "./previewAuthStorage";

// Environment variables can override the production We Find Guards project.
// The fallback values let the Lovable project work immediately after syncing.
const SUPABASE_URL =
  import.meta.env['VITE_SUPABASE_URL'] ?? "https://yatawyeamsaxemjctggp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhdGF3eWVhbXNheGVtamN0Z2dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMTA1NjAsImV4cCI6MjEwMTg4NjU2MH0.vg2jVFlxYm2HNmTTftfwAs9C8Dm0HQAt2H2Pv13vIk8";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: brokeredPreviewStorage(),
    persistSession: true,
    autoRefreshToken: true,
  },
});
