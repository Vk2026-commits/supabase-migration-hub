import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Scheduler only: never accept a browser token or application ID from callers.
serve(async (request) => {
  const secret = Deno.env.get("NOTIFICATION_CRON_SECRET");
  if (request.method !== "POST" || !secret || request.headers.get("x-notification-cron") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);
  let processed = 0;
  // Bounded runtime; the minute scheduler picks up remaining work. Each job has
  // a DB lease so overlapping runs and worker crashes are safe to retry.
  for (let index = 0; index < 2; index++) {
    const claim = await admin.rpc("claim_hiring_submission_job");
    if (claim.error) return Response.json({ error: "Unable to claim work" }, { status: 500 });
    const job = claim.data?.[0];
    if (!job) break;
    try {
      if (job.kind === "profile_sync") {
        const result = await admin.rpc("sync_hiring_submission_profile", { _id: job.id, _lease_id: job.lease_id });
        if (result.error) throw result.error;
      } else {
        const response = await fetch(`${url}/functions/v1/archive-application-evidence`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
          body: JSON.stringify({ hiring_application_id: job.employer_application_id, archive_kind: "submission" }),
          signal: AbortSignal.timeout(45000),
        });
        const result = await response.json();
        if (!response.ok || result.snapshot_status !== "complete") throw new Error(result.error || "Archive did not complete");
        const finished = await admin.rpc("finish_hiring_submission_job", { _id: job.id, _lease_id: job.lease_id });
        if (finished.error) throw finished.error;
      }
      processed++;
    } catch (error) {
      // Store a bounded diagnostic, not the application or signature payload.
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "Background processing failed");
      await admin.rpc("finish_hiring_submission_job", { _id: job.id, _lease_id: job.lease_id, _error: message });
    }
  }
  return Response.json({ processed });
});
