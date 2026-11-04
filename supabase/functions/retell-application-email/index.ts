// Retell HR tool. No caller-provided links or arbitrary email bodies are accepted.
const APPLICATION_URL = "https://wefindguards.com/get-started";
const HR_AGENT = "agent_e4c3a2078ca7f5adc0d26fd0e1";
const reply = (status: number, body: object) => Response.json(body, { status });
export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return reply(405, { success: false });
  const secret = Deno.env.get("KAIROS_APPLICATION_EMAIL_SECRET");
  if (!secret || req.headers.get("x-kairos-email-secret") !== secret)
    return reply(401, { success: false, error: "Unauthorized" });
  try {
    const body = await req.json();
    const email = String(body.args?.applicant_email ?? "").trim().toLowerCase();
    const name = String(body.args?.applicant_name ?? "").trim();
    const callId = String(body.call?.call_id ?? "");
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 254 || !name || name.length > 150 || !/^call_[\w-]+$/.test(callId))
      return reply(400, { success: false, error: "A confirmed name, email, and call are required." });
    const retellKey = Deno.env.get("KAIROS_RETELL_API_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!retellKey || !resendKey) throw new Error("Configuration missing");
    const callResponse = await fetch(`https://api.retellai.com/v2/get-call/${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${retellKey}` }, signal: AbortSignal.timeout(10000),
    });
    if (!callResponse.ok) return reply(403, { success: false, error: "Unable to verify HR call." });
    const call = await callResponse.json();
    const age = Date.now() - Number(call.start_timestamp);
    if (call.agent_id !== HR_AGENT || !Number.isFinite(age) || age < -60000 || age > 12 * 60 * 60 * 1000)
      return reply(403, { success: false, error: "A current Kairos HR call is required." });
    const text = `Hello ${name},\n\nThank you for your interest in joining Kairos Security.\n\nGet started here:\n${APPLICATION_URL}\n\nCreate your officer account, or sign in if you already have one, then complete your profile and apply for a Kairos Security position.\n\nThis replaces our previous application link. If you need help, contact info@kairossecurity.com.\n\nKairos Security Hiring Team`;
    // Provider idempotency prevents duplicate sends on tool retries (24 hours).
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${callId}:${email}`))))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `kairos-start-${hash}` },
      body: JSON.stringify({ from: "Kairos Security via We Find Guards <noreply@wefindguards.com>", to: [email], reply_to: "info@kairossecurity.com", subject: "Get started with Kairos Security on We Find Guards", text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!sent.ok) return reply(502, { success: false, error: "Email was not confirmed sent. Offer to try again or contact info@kairossecurity.com." });
    const result = await sent.json();
    return reply(200, { success: true, email_id: result.id, application_url: APPLICATION_URL, message: "Email accepted for delivery. Ask the caller to check their inbox and spam folder." });
  } catch {
    return reply(502, { success: false, error: "Unable to confirm email delivery. Do not tell the caller it was sent." });
  }
}
Deno.serve(handler);
