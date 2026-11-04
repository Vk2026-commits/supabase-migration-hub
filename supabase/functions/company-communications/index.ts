import { createClient } from "npm:@supabase/supabase-js@2";
const COMPANY = "abaebf12-8db2-44f7-b60e-a8931405df88";
const AGENTS = ["agent_8947865df608da57d4ff7c8375", "agent_e4c3a2078ca7f5adc0d26fd0e1"];
const NUMBERS = ["+17135613537", "+16416098811"];
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
const belongs = (r: any, kind: string) =>
  kind === "call"
    ? AGENTS.includes(r.agent_id)
    : r.chat_type === "sms_chat" &&
      (NUMBERS.includes(r.from_number) || NUMBERS.includes(r.to_number));
const normalize = (r: any, kind: string) => {
  const a = (kind === "call" ? r.call_analysis : r.chat_analysis) || {};
  return {
    company_id: COMPANY,
    provider_id: r.call_id || r.chat_id,
    kind,
    agent_id: r.agent_id,
    agent_name: r.agent_name || null,
    started_at: r.start_timestamp ? new Date(r.start_timestamp).toISOString() : null,
    duration_ms: Math.max(0, r.duration_ms || 0),
    direction: r.direction || null,
    from_number: r.from_number || null,
    to_number: r.to_number || null,
    status: r.call_status || r.chat_status || null,
    summary: a.call_summary || a.chat_summary || null,
    sentiment: a.user_sentiment || null,
    successful: a.call_successful ?? a.chat_successful ?? null,
    disconnection_reason: r.disconnection_reason || null,
    transferred: Boolean(r.transfer_destination || /transfer/.test(r.disconnection_reason || "")),
    synced_at: new Date().toISOString(),
  };
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const bridge = Deno.env.get("WFG_RETELL_BRIDGE_SECRET");
    const trusted = Boolean(bridge && req.headers.get("x-wfg-bridge") === bridge);
    if (!trusted) {
      const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
      });
      const { data: auth, error } = await user.auth.getUser();
      if (error || !auth.user) return reply({ error: "Sign in first" }, 401);
      const { data: allowed, error: denied } = await user.rpc("company_team_has_access", {
        _company_id: COMPANY,
        _allowed_roles: ["owner", "admin", "hiring_manager"],
      });
      if (body.company_id !== COMPANY || denied || !allowed)
        return reply({ error: "Not authorized for Kairos communications" }, 403);
    }
    const key = Deno.env.get("KAIROS_RETELL_API_KEY");
    if (!key) throw new Error("Retell connection is not configured");
    const api = async (path: string, data?: unknown) => {
      const r = await fetch(`https://api.retellai.com${path}`, {
        method: data ? "POST" : "GET",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        ...(data ? { body: JSON.stringify(data) } : {}),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error(`Retell request failed (${r.status})`);
      return r.json();
    };
    const save = async (items: any[], kind: string) => {
      const records = items.filter((r) => belongs(r, kind)).map((r) => normalize(r, kind));
      if (records.length) {
        const { error } = await admin.from("company_communications").upsert(records);
        if (error) throw new Error(error.message);
      }
      return records.length;
    };
    if (body.action === "webhook") {
      if (!trusted) return reply({ error: "Invalid webhook authentication" }, 401);
      const item = body.call || body.chat;
      const kind = body.call ? "call" : "sms";
      if (!item || !belongs(item, kind)) return reply({ ignored: true });
      // Fetch current provider state so delayed/replayed events cannot restore older data.
      const id = item.call_id || item.chat_id;
      const fresh = await api(
        `/${kind === "call" ? "v2/get-call" : "get-chat"}/${encodeURIComponent(id)}`,
      );
      await save([fresh], kind);
      return reply({ ok: true });
    }
    if (body.action === "detail") {
      const { data: stored, error } = await admin
        .from("company_communications")
        .select("kind")
        .eq("company_id", COMPANY)
        .eq("provider_id", body.id)
        .maybeSingle();
      if (error || !stored) return reply({ error: "Record not found" }, 404);
      const d = await api(
        `/${stored.kind === "call" ? "v2/get-call" : "get-chat"}/${encodeURIComponent(body.id)}`,
      );
      if (!belongs(d, stored.kind)) return reply({ error: "Record not found" }, 404);
      return reply({
        transcript: d.transcript || null,
        messages:
          stored.kind === "sms"
            ? d.message_with_tool_calls
                ?.filter((m: any) => m.type === "message")
                .map((m: any) => ({ role: m.role, content: m.content }))
            : undefined,
        recording_url: d.recording_url || null,
      });
    }
    if (body.action !== "sync") return reply({ error: "Unknown action" }, 400);
    const kind = body.kind === "sms" ? "sms" : "call";
    const d = await api(`/v3/list-${kind === "call" ? "calls" : "chats"}`, {
      limit: 500,
      sort_order: "descending",
      ...(body.cursor ? { pagination_key: body.cursor } : {}),
      ...(kind === "call"
        ? { filter_criteria: { agent: AGENTS.map((agent_id) => ({ agent_id })) } }
        : {}),
    });
    const count = await save(d.items || [], kind);
    const cursor =
      d.pagination_key ||
      (d.has_more ? d.items?.at(-1)?.[kind === "call" ? "call_id" : "chat_id"] : null);
    if (d.has_more && !cursor) throw new Error("Retell pagination is incomplete; retry sync");
    const { error } = await admin
      .from("company_communication_sync")
      .upsert({
        company_id: COMPANY,
        last_sync_at: new Date().toISOString(),
        [kind === "call" ? "calls_complete" : "sms_complete"]: !d.has_more,
      });
    if (error) throw new Error(error.message);
    return reply({ count, cursor: d.has_more ? cursor : null });
  } catch (e) {
    console.error(
      "Communications request failed",
      e instanceof Error ? e.message : "Unknown error",
    );
    return reply({ error: e instanceof Error ? e.message : "Unable to load communications" }, 500);
  }
});
