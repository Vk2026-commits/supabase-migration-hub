import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Deployed through the We Find Guards production integration.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    // Verify auth token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const token = authHeader.replace("Bearer ", "");

    // Use anon client to validate token and get user
    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userRes, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const userId = userRes.user.id;

    // Admin client to bypass RLS for initial ensure
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check existing profile
    const { data: existing, error: selectErr } = await admin
      .from("officer_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (selectErr) throw selectErr;

    if (existing) {
      return new Response(JSON.stringify({ id: existing.id, created: false }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Insert minimal row
    const { data: inserted, error: insertErr } = await admin
      .from("officer_profiles")
      .insert({ user_id: userId })
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ id: inserted.id, created: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
