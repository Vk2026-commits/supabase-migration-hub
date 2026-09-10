import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-notification-cron",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const html = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const clean = (value: unknown) => String(value ?? "").trim();
const now = () => new Date().toISOString();
const plusHours = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

const hashToken = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
};

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const appUrl = () => (Deno.env.get("APP_URL") || "https://wefindguards.com").replace(/\/+$/, "");

type Workflow = {
  id: string;
  kind: string;
  recipient_user_id: string;
  recipient_email: string;
  company_id: string | null;
  officer_id: string | null;
  hiring_application_id: string | null;
  employment_offer_id: string | null;
  hire_id: string | null;
  onboarding_packet_id: string | null;
  context: Record<string, unknown> | null;
  status: "active" | "delivered" | "completed" | "cancelled";
};

const destinationFor = (workflow: Workflow) => {
  switch (workflow.kind) {
    case "application_reminder":
    case "application_submitted_officer":
      return "/dashboard?tab=hiring-application";
    case "application_submitted_company":
      return "/dashboard?tab=applicants";
    case "offer_action":
    case "onboarding_action":
    case "onboarding_submitted_officer":
      return "/dashboard?tab=employee-onboarding";
    case "onboarding_submitted_company":
      return "/dashboard?tab=employment";
    default:
      return "/dashboard";
  }
};

const emailContentFor = (workflow: Workflow, actionUrl: string) => {
  const context = workflow.context || {};
  const officerName = html(context.officer_name || "there");
  const companyName = html(context.company_name || "your hiring company");
  const position = html(context.position || "Security Officer");
  const deadline = html(context.acceptance_deadline || "");

  switch (workflow.kind) {
    case "application_reminder":
      return {
        subject: "Complete your We Find Guards hiring application",
        eyebrow: "Application reminder",
        title: "Your hiring application is waiting",
        paragraphs: [
          `Hi ${officerName}, your We Find Guards hiring application is saved and ready when you are.`,
          "Complete the remaining required steps to submit your application to a hiring company.",
        ],
        cta: "Continue application",
        note: "For your protection, this secure link works once. A newer reminder replaces any earlier link.",
      };
    case "application_submitted_officer":
      return {
        subject: "Your hiring application has been sent",
        eyebrow: "Application submitted",
        title: "Your application is on its way",
        paragraphs: [
          `Hi ${officerName}, your application for ${position} has been submitted to ${companyName}.`,
          "You can return to your application at any time to review your submitted information.",
        ],
        cta: "View application",
        note: "This secure link works once. Sign in with your We Find Guards account if prompted.",
      };
    case "application_submitted_company":
      return {
        subject: `${clean(context.officer_name) || "A security professional"} submitted a hiring application`,
        eyebrow: "New applicant",
        title: "A new hiring application is ready",
        paragraphs: [
          `${officerName} submitted an application for the ${position} position at ${companyName}.`,
          "Open your Applicants page to review the complete application and supporting documents.",
        ],
        cta: "Review applicant",
        note: "This secure link works once. Sign in with your We Find Guards account if prompted.",
      };
    case "offer_action":
      return {
        subject: `You have a new employment offer from ${clean(context.company_name) || "a hiring company"}`,
        eyebrow: "Employment offer",
        title: "A company has sent you an offer",
        paragraphs: [
          `Hi ${officerName}, ${companyName} sent you an employment offer for ${position}.`,
          deadline
            ? `Review the complete offer and respond by ${deadline}.`
            : "Review the complete offer and respond when you are ready.",
        ],
        cta: "Review offer",
        note: "For your protection, this secure link works once. A daily reminder replaces any earlier offer link until you respond.",
      };
    case "onboarding_action":
      return {
        subject: "Complete your employee onboarding",
        eyebrow: "Employee onboarding",
        title: "Your onboarding packet is ready",
        paragraphs: [
          `Hi ${officerName}, ${companyName} is ready for you to complete employee onboarding for your ${position} position.`,
          "Complete every required section and submit your onboarding packet securely.",
        ],
        cta: "Continue onboarding",
        note: "For your protection, this secure link works once. A daily reminder replaces any earlier onboarding link until your packet is complete.",
      };
    case "onboarding_submitted_officer":
      return {
        subject: "Your employee onboarding is complete",
        eyebrow: "Onboarding complete",
        title: "Your onboarding packet was submitted",
        paragraphs: [
          `Hi ${officerName}, your employee onboarding packet for ${companyName} has been submitted.`,
          "Your hiring company has been notified that the packet is ready for its records.",
        ],
        cta: "View onboarding status",
        note: "This secure link works once. Sign in with your We Find Guards account if prompted.",
      };
    case "onboarding_submitted_company":
      return {
        subject: `${clean(context.officer_name) || "An employee"} completed onboarding`,
        eyebrow: "Onboarding complete",
        title: "An employee onboarding packet is ready",
        paragraphs: [
          `${officerName} completed their employee onboarding packet for ${companyName}.`,
          "Open the Hired page to review the onboarding status and authorized records.",
        ],
        cta: "View onboarding status",
        note: "This secure link works once. Sign in with your We Find Guards account if prompted.",
      };
    default:
      return {
        subject: "An update from We Find Guards",
        eyebrow: "Account update",
        title: "You have an account update",
        paragraphs: ["Open your We Find Guards account to view this update."],
        cta: "Open account",
        note: "This secure link works once. Sign in with your We Find Guards account if prompted.",
      };
  }
};

const brandedEmail = ({
  eyebrow,
  title,
  paragraphs,
  cta,
  actionUrl,
  note,
}: {
  eyebrow: string;
  title: string;
  paragraphs: string[];
  cta: string;
  actionUrl: string;
  note: string;
}) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${html(title)} | We Find Guards</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f8fafc;">
      <tr><td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.1);">
          <tr><td style="height:5px;background:#fbbd23;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:26px 36px;background:#0846aa;color:#ffffff;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
              <td style="width:34px;height:34px;border-radius:8px;background:#ffffff;color:#0846aa;text-align:center;font-size:21px;font-weight:700;line-height:34px;">W</td>
              <td style="padding-left:11px;vertical-align:middle;"><div style="color:#ffffff;font-size:21px;font-weight:700;line-height:1.15;">We Find Guards</div><div style="padding-top:3px;color:#dbeafe;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:1.2;text-transform:uppercase;">${html(eyebrow)}</div></td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:38px 36px 34px;">
            <p style="margin:0 0 12px;color:#0a5adb;font-size:12px;font-weight:700;letter-spacing:.8px;line-height:1.3;text-transform:uppercase;">We Find Guards</p>
            <h1 style="margin:0 0 16px;color:#0f172a;font-size:28px;font-weight:700;letter-spacing:-.3px;line-height:1.25;">${html(title)}</h1>
            ${paragraphs.map((paragraph) => `<p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.65;">${paragraph}</p>`).join("")}
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 28px;"><tr><td style="border-radius:8px;background:#0846aa;"><a href="${html(actionUrl)}" style="display:inline-block;padding:14px 22px;border:1px solid #0846aa;border-radius:8px;color:#ffffff;font-size:16px;font-weight:700;line-height:1;text-decoration:none;">${html(cta)}</a></td></tr></table>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eff6ff;border-radius:8px;"><tr><td style="padding:14px 16px;"><p style="margin:0;color:#334155;font-size:13px;line-height:1.55;"><strong style="color:#0846aa;">Secure account link:</strong> ${html(note)}</p></td></tr></table>
            <p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6;">If you were not expecting this email, you can safely ignore it.</p>
            <p style="margin:18px 0 0;color:#334155;font-size:14px;line-height:1.6;">Thank you,<br /><strong>The We Find Guards Team</strong></p>
          </td></tr>
          <tr><td style="padding:17px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;"><p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">We Find Guards · Connecting security companies with qualified security professionals</p></td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

const actionIsComplete = async (admin: ReturnType<typeof createClient>, workflow: Workflow) => {
  if (workflow.kind === "application_reminder") {
    const { data } = await admin
      .from("guard_hiring_applications")
      .select("id")
      .eq("user_id", workflow.recipient_user_id)
      .eq("application_type", "master")
      .eq("status", "submitted")
      .limit(1)
      .maybeSingle();
    return Boolean(data);
  }

  if (workflow.kind === "offer_action") {
    const { data } = await admin
      .from("employment_offers")
      .select("status,terms")
      .eq("id", workflow.employment_offer_id)
      .maybeSingle();
    if (!data || !["sent", "viewed"].includes(data.status)) return true;
    const deadline = clean(data.terms?.acceptanceDeadline);
    return Boolean(deadline && deadline < new Date().toISOString().slice(0, 10));
  }

  if (workflow.kind === "onboarding_action") {
    const { data } = await admin
      .from("officer_onboarding_packets")
      .select("status")
      .eq("hire_id", workflow.hire_id)
      .maybeSingle();
    return data?.status === "submitted";
  }

  return false;
};

const issueActionLink = async (admin: ReturnType<typeof createClient>, workflow: Workflow) => {
  const issuedAt = now();
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const { error: supersedeError } = await admin
    .from("notification_action_links")
    .update({ superseded_at: issuedAt })
    .eq("workflow_id", workflow.id)
    .is("used_at", null)
    .is("superseded_at", null);
  if (supersedeError) throw supersedeError;

  const { error: createError } = await admin.from("notification_action_links").insert({
    workflow_id: workflow.id,
    recipient_user_id: workflow.recipient_user_id,
    token_hash: tokenHash,
    expires_at: plusHours(168),
  });
  if (createError) throw createError;

  return `${appUrl()}/notification-action?token=${encodeURIComponent(token)}`;
};

const dispatch = async (admin: ReturnType<typeof createClient>) => {
  const dispatchStartedAt = now();
  const { data: due, error } = await admin
    .from("notification_workflows")
    .select("*")
    .eq("status", "active")
    .lte("next_send_at", dispatchStartedAt)
    .order("next_send_at", { ascending: true })
    .limit(50);
  if (error) throw error;

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) throw new Error("RESEND_API_KEY is not configured");
  const resend = new Resend(resendKey);
  const results: Array<{ workflow_id: string; state: string }> = [];

  for (const untrustedWorkflow of due || []) {
    const workflow = untrustedWorkflow as Workflow;
    const claimingUntil = plusHours(0.25);
    const { data: claimed, error: claimError } = await admin
      .from("notification_workflows")
      .update({ next_send_at: claimingUntil, updated_at: dispatchStartedAt })
      .eq("id", workflow.id)
      .eq("status", "active")
      .lte("next_send_at", dispatchStartedAt)
      .select("*")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    const activeWorkflow = claimed as Workflow;
    try {
      if (await actionIsComplete(admin, activeWorkflow)) {
        await admin
          .from("notification_workflows")
          .update({
            status: "completed",
            completed_at: now(),
            next_send_at: null,
            updated_at: now(),
          })
          .eq("id", activeWorkflow.id);
        results.push({ workflow_id: activeWorkflow.id, state: "already-complete" });
        continue;
      }

      const actionUrl = await issueActionLink(admin, activeWorkflow);
      const content = emailContentFor(activeWorkflow, actionUrl);
      const delivery = await resend.emails.send({
        from: "We Find Guards <noreply@wefindguards.com>",
        to: [activeWorkflow.recipient_email],
        subject: content.subject,
        html: brandedEmail({ ...content, actionUrl }),
      });
      if (delivery.error) throw new Error(delivery.error.message);

      const requiresReminder = [
        "application_reminder",
        "offer_action",
        "onboarding_action",
      ].includes(activeWorkflow.kind);
      await admin
        .from("notification_workflows")
        .update(
          requiresReminder
            ? { last_sent_at: now(), next_send_at: plusHours(24), updated_at: now() }
            : {
                status: "delivered",
                last_sent_at: now(),
                next_send_at: null,
                completed_at: now(),
                updated_at: now(),
              },
        )
        .eq("id", activeWorkflow.id);
      results.push({
        workflow_id: activeWorkflow.id,
        state: requiresReminder ? "sent-reminder-enabled" : "sent",
      });
    } catch (error) {
      console.error("Workflow notification delivery failed", {
        workflow_id: activeWorkflow.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await admin
        .from("notification_workflows")
        .update({ next_send_at: plusHours(0.25), updated_at: now() })
        .eq("id", activeWorkflow.id)
        .eq("status", "active");
      results.push({ workflow_id: activeWorkflow.id, state: "retrying" });
    }
  }

  return results;
};

const resolveActionLink = async (
  admin: ReturnType<typeof createClient>,
  request: Request,
  token: string,
) => {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer "))
    return json({ error: "Sign in is required", requires_login: true }, 401);
  const { data: auth, error: authError } = await admin.auth.getUser(authorization.slice(7));
  if (authError || !auth.user)
    return json({ error: "Sign in is required", requires_login: true }, 401);

  const tokenHash = await hashToken(token);
  const { data: link, error: linkError } = await admin
    .from("notification_action_links")
    .select(
      "id,workflow_id,recipient_user_id,expires_at,used_at,superseded_at,notification_workflows(*)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link || link.recipient_user_id !== auth.user.id)
    return json({ error: "This secure link is not available for this account" }, 403);
  if (link.used_at || link.superseded_at || new Date(link.expires_at).getTime() < Date.now())
    return json({ error: "This secure link has expired. Please use the most recent email." }, 410);

  const workflow = Array.isArray(link.notification_workflows)
    ? link.notification_workflows[0]
    : link.notification_workflows;
  if (!workflow || workflow.status === "cancelled")
    return json({ error: "This notification is no longer active" }, 410);
  if (await actionIsComplete(admin, workflow as Workflow)) {
    await admin
      .from("notification_workflows")
      .update({ status: "completed", completed_at: now(), next_send_at: null, updated_at: now() })
      .eq("id", workflow.id);
    return json({ error: "This item is already complete" }, 410);
  }

  const usedAt = now();
  const { data: consumed, error: consumeError } = await admin
    .from("notification_action_links")
    .update({ used_at: usedAt })
    .eq("id", link.id)
    .is("used_at", null)
    .is("superseded_at", null)
    .gte("expires_at", usedAt)
    .select("id")
    .maybeSingle();
  if (consumeError) throw consumeError;
  if (!consumed)
    return json({ error: "This secure link has expired. Please use the most recent email." }, 410);

  return json({ destination: destinationFor(workflow as Workflow) });
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const body = await request.json().catch(() => ({}));
    const action = clean(body.action);

    if (action === "dispatch") {
      const expectedSecret = Deno.env.get("NOTIFICATION_CRON_SECRET");
      if (!expectedSecret || request.headers.get("x-notification-cron") !== expectedSecret) {
        return json({ error: "Unauthorized scheduler" }, 401);
      }
      const results = await dispatch(admin);
      return json({ processed: results.length, results });
    }

    if (action === "resolve") {
      const token = clean(body.token);
      if (!token || token.length < 32) return json({ error: "Invalid secure link" }, 400);
      return await resolveActionLink(admin, request, token);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error(
      "Workflow notification request failed",
      error instanceof Error ? error.message : String(error),
    );
    return json({ error: "Notification request could not be completed" }, 500);
  }
});
