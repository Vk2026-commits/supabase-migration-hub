import { createClient } from "npm:@supabase/supabase-js@2";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return reply({ error: "Sign in first" }, 401);
    const body = await req.json();
    const { data: allowed, error: permissionError } = await client.rpc("company_team_has_access", {
      _company_id: body.company_id,
      _allowed_roles: ["owner", "admin", "hiring_manager"],
    });
    if (permissionError || !allowed)
      return reply({ error: "Not authorized to send company invitations" }, 403);
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) throw new Error("Email service is not configured");
    const emailRequest = async (path: string, body?: unknown, idempotencyKey?: string) => {
      const response = await fetch(`https://api.resend.com${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      return response.ok
        ? { data, error: null }
        : { data: null, error: { message: data.message || "Email service request failed" } };
    };
    if (body.action === "refresh") {
      const { data: invites, error } = await admin
        .from("legacy_applicant_invitations")
        .select("id,provider_id")
        .eq("company_id", body.company_id)
        .is("revoked_at", null)
        .not("provider_id", "is", null)
        .limit(100);
      if (error) throw error;
      for (const invite of invites || []) {
        const response = await emailRequest(`/emails/${encodeURIComponent(invite.provider_id)}`);
        if (response.error) continue;
        const event = response.data?.last_event;
        const status =
          event === "delivered" || event === "opened" || event === "clicked"
            ? "delivered"
            : event === "bounced"
              ? "bounced"
              : event === "complained"
                ? "complained"
                : event === "failed"
                  ? "failed"
                  : null;
        if (status)
          await admin
            .from("legacy_applicant_invitations")
            .update({ email_status: status })
            .eq("id", invite.id);
      }
      return reply({ success: true });
    }
    if (
      body.action !== "send" ||
      !Array.isArray(body.recipients) ||
      !body.recipients.length ||
      body.recipients.length > 50 ||
      body.confirm !== true
    )
      return reply({ error: "Confirm the selected recipients before sending" }, 400);
    const { data: company, error: companyError } = await admin
      .from("company_profiles")
      .select("company_name")
      .eq("id", body.company_id)
      .single();
    if (companyError) throw companyError;
    const results = [];
    for (const recipient of body.recipients) {
      let reservationId: string | null = null;
      try {
        const { data: source } = await admin
          .from("company_legacy_applications")
          .select("id")
          .eq("id", recipient.legacy_id)
          .eq("company_id", body.company_id)
          .maybeSingle();
        if (!source) throw new Error("Applicant not found in this company");
        const token = crypto.randomUUID() + crypto.randomUUID();
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const { data: reserved, error } = await client.rpc("reserve_legacy_invitation", {
          _request_id: recipient.request_id,
          _legacy_id: recipient.legacy_id,
          _job_id: body.job_id,
          _token_hash: hash,
        });
        if (error) throw error;
        if (!reserved.created) {
          results.push({ id: recipient.legacy_id, status: reserved.email_status });
          continue;
        }
        reservationId = reserved.id;
        const link = `https://wefindguards.com/imported-application?token=${encodeURIComponent(token)}`;
        const companyName = company.company_name;
        const text = `${companyName} already has your application. Join We Find Guards to review your saved information and continue the hiring process.\n\nCreate an officer account or sign in using this email address. Your previous answers will be available for review. Complete any missing information and provide a new signature to confirm your application.\n\n${link}\n\nThis invitation expires in 7 days. If you already have an application for this position, we will keep your existing progress.`;
        const delivery = await emailRequest(
          "/emails",
          {
            from: "We Find Guards <noreply@wefindguards.com>",
            to: [reserved.email],
            subject: `${companyName}: review your saved application`,
            text,
            html: `<h2>${escape(companyName)} has your application</h2><p>Join We Find Guards to review your saved information and continue the hiring process.</p><p>Create an officer account or sign in using this email address. Review your previous answers, complete missing information, and provide a new signature. Existing application progress is preserved.</p><p><a href="${escape(link)}">Review my application</a></p><p>This invitation expires in 7 days.</p>`,
          },
          reserved.id,
        );
        if (delivery.error || !delivery.data?.id)
          throw new Error(delivery.error?.message || "Email was not accepted");
        const { error: saveError } = await admin
          .from("legacy_applicant_invitations")
          .update({ email_status: "accepted", provider_id: delivery.data.id, last_error: null })
          .eq("id", reserved.id);
        if (saveError)
          throw new Error(
            "Email accepted; delivery status could not be saved. Contact support before resending.",
          );
        results.push({ id: recipient.legacy_id, status: "accepted" });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unable to send invitation";
        if (reservationId)
          await admin
            .from("legacy_applicant_invitations")
            .update({ email_status: "failed", last_error: message })
            .eq("id", reservationId);
        results.push({ id: recipient.legacy_id, status: "failed", error: message });
      }
    }
    return reply({ results });
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : "Request failed" }, 400);
  }
});
