import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IMPORT_SECRET = Deno.env.get("CRON_SECRET")!;

Deno.serve(async (req) => {
  if (req.headers.get("x-import-secret") !== IMPORT_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { officers } = await req.json();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const results = { user_created: 0, profile_created: 0, officer_created: 0, errors: [] as any[] };

  for (const o of officers) {
    try {
      // Try to find existing profile by email
      let uid: string | null = null;
      const { data: existing } = await admin.from("profiles").select("id").eq("email", o.email).maybeSingle();
      if (existing) {
        uid = existing.id;
      } else {
        const { data: u, error: ue } = await admin.auth.admin.createUser({
          email: o.email,
          email_confirm: true,
          password: crypto.randomUUID() + "Aa1!",
          user_metadata: { full_name: o.full_name, role: "officer" },
        });
        if (ue || !u.user) {
          results.errors.push({ email: o.email, step: "createUser", error: ue?.message });
          continue;
        }
        uid = u.user.id;
        results.user_created++;
        await admin.from("profiles").update({ full_name: o.full_name }).eq("id", uid);
        results.profile_created++;
      }

      // Check if officer_profile already exists
      const { data: opExisting } = await admin.from("officer_profiles").select("id").eq("user_id", uid).maybeSingle();
      if (opExisting) continue;

      const { error: opErr } = await admin.from("officer_profiles").insert({
        user_id: uid,
        title: o.title,
        phone: o.phone || null,
        address_street: o.address_street || null,
        address_unit: o.address_unit || null,
        address_city: o.address_city || null,
        address_state: o.address_state || null,
        address_zip: o.address_zip || null,
        date_of_birth: o.date_of_birth,
        account_status: "cancelled",
      });
      if (opErr) {
        results.errors.push({ email: o.email, step: "officer_profiles", error: opErr.message });
      } else {
        results.officer_created++;
      }
    } catch (e: any) {
      results.errors.push({ email: o.email, error: String(e) });
    }
  }
  return new Response(JSON.stringify(results), {
    headers: { "Content-Type": "application/json" },
  });
});
