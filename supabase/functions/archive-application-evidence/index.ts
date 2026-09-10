import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const basename = (path: string) => path.split("/").pop() || "file";
const cleanCertificationPath = (path: string) => path.startsWith("http") ? path.split("certification-documents/").pop() || "" : path;
const photoLabels: Record<string, string> = {
  headshot: "Professional headshot",
  "full-body": "Full-body photo",
  "action-1": "Action photo 1",
  "action-2": "Action photo 2",
};

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in is required" }, 401);

  let failureAdmin: ReturnType<typeof createClient> | null = null;
  let failureApplicationId: string | null = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    failureAdmin = admin;
    const token = authorization.replace("Bearer ", "");
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);

    const { hiring_application_id: applicationId, archive_kind: requestedKind } = await request.json();
    if (!applicationId) return json({ error: "A hiring application is required" }, 400);
    failureApplicationId = applicationId;

    const { data: application, error: applicationError } = await admin
      .from("guard_hiring_applications")
      .select("id,officer_id,user_id,job_application_id,application_type,status,submitted_at,evidence_snapshot_status,evidence_snapshot_kind,application_data")
      .eq("id", applicationId)
      .maybeSingle();
    if (applicationError || !application || application.application_type !== "employer_copy") return json({ error: "Employer application not found" }, 404);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", authData.user.id);
    const isAdmin = (roles || []).some((item: { role: string }) => ["admin", "view_only", "full_access"].includes(item.role));
    let isCompany = false;
    if (application.job_application_id) {
      const { data: jobApplication } = await admin.from("job_applications").select("job_posting_id").eq("id", application.job_application_id).maybeSingle();
      const { data: jobPosting } = jobApplication?.job_posting_id
        ? await admin.from("job_postings").select("company_id").eq("id", jobApplication.job_posting_id).maybeSingle()
        : { data: null };
      const { data: company } = jobPosting?.company_id
        ? await admin.from("company_profiles").select("user_id,subscription_tier").eq("id", jobPosting.company_id).maybeSingle()
        : { data: null };
      const { data: member } = jobPosting?.company_id
        ? await admin.from("company_members").select("status").eq("company_id", jobPosting.company_id).eq("user_id", authData.user.id).maybeSingle()
        : { data: null };
      isCompany = Boolean(
        company
        && (company.user_id === authData.user.id || ["active", "invited"].includes(member?.status || ""))
        && ["professional", "premium"].includes(company.subscription_tier),
      );
    }
    const isOwner = application.user_id === authData.user.id;
    const archiveKind = requestedKind === "legacy" || application.evidence_snapshot_kind === "legacy" ? "legacy" : "submission";
    if ((archiveKind === "submission" && !isOwner && !isAdmin) || (archiveKind === "legacy" && !isOwner && !isCompany && !isAdmin)) {
      return json({ error: "You do not have access to archive this application" }, 403);
    }

    const { data: existing } = await admin.from("application_evidence_files").select("*").eq("hiring_application_id", application.id).order("evidence_kind").order("evidence_role");
    if (application.evidence_snapshot_status === "complete" && existing?.length) return json({ attachments: existing, snapshot_status: "complete", archive_kind: application.evidence_snapshot_kind });

    await admin.from("guard_hiring_applications").update({ evidence_snapshot_status: "processing", evidence_snapshot_kind: archiveKind }).eq("id", application.id);

    const { data: officer, error: officerError } = await admin.from("officer_profiles").select("id,user_id").eq("id", application.officer_id).single();
    if (officerError || !officer) throw new Error("Officer profile not found");
    const [{ data: photoFiles, error: photoError }, { data: certifications, error: certificationError }] = await Promise.all([
      admin.storage.from("officer-photos").list(officer.user_id, { limit: 100 }),
      admin.from("certifications").select("id,name,license_level,certification_type,certification_number,issuing_organization,issue_date,expiry_date,document_front_url,document_back_url").eq("officer_id", officer.id),
    ]);
    if (photoError) throw photoError;
    if (certificationError) throw certificationError;

    const sources: Array<{ kind: "photo" | "certification"; role: string; label: string; bucket: string; path: string; sourceId: string | null; required: boolean; metadata: Record<string, unknown> }> = [];
    for (const file of photoFiles || []) {
      const role = file.name.split(".")[0];
      if (!photoLabels[role]) continue;
      sources.push({ kind: "photo", role, label: photoLabels[role], bucket: "officer-photos", path: `${officer.user_id}/${file.name}`, sourceId: null, required: role === "headshot" || role === "full-body", metadata: { photoType: role } });
    }
    for (const certification of certifications || []) {
      for (const side of ["front", "back"] as const) {
        const rawPath = certification[`document_${side}_url`];
        const path = rawPath ? cleanCertificationPath(rawPath) : "";
        if (!path) continue;
        const name = certification.name || certification.license_level || "Certification";
        sources.push({ kind: "certification", role: `${certification.id}-${side}`, label: `${name} — ${side === "front" ? "Front" : "Back"} document`, bucket: "certification-documents", path, sourceId: certification.id, required: side === "front", metadata: { name, side, licenseLevel: certification.license_level, certificationType: certification.certification_type, certificationNumber: certification.certification_number, issuingOrganization: certification.issuing_organization, issueDate: certification.issue_date, expiryDate: certification.expiry_date } });
      }
    }

    const rolesPresent = new Set(sources.filter((source) => source.kind === "photo").map((source) => source.role));
    const hasCertificationFront = sources.some((source) => source.kind === "certification" && source.role.endsWith("-front"));
    if (archiveKind === "submission" && (!rolesPresent.has("headshot") || !rolesPresent.has("full-body") || !hasCertificationFront)) {
      await admin.from("guard_hiring_applications").update({ evidence_snapshot_status: "failed" }).eq("id", application.id);
      return json({ error: "Upload a headshot, full-body photo, and certification front before submitting" }, 400);
    }
    if (!sources.length) {
      await admin.from("guard_hiring_applications").update({ evidence_snapshot_status: "legacy_unavailable", evidence_snapshot_kind: archiveKind }).eq("id", application.id);
      return json({ attachments: [], snapshot_status: "legacy_unavailable", archive_kind: archiveKind });
    }

    const archivedAt = new Date().toISOString();
    const rows = [];
    for (const source of sources) {
      const { data: blob, error: downloadError } = await admin.storage.from(source.bucket).download(source.path);
      if (downloadError || !blob) throw downloadError || new Error(`Could not read ${source.label}`);
      const bytes = await blob.arrayBuffer();
      const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
      const safeName = basename(source.path).replace(/[^a-zA-Z0-9._-]/g, "-");
      const destination = `${application.id}/${source.kind === "photo" ? "Photos" : "Certifications"}/${source.role}-${safeName}`;
      const { error: uploadError } = await admin.storage.from("application-evidence").upload(destination, bytes, { contentType: blob.type || "application/octet-stream", upsert: true });
      if (uploadError) throw uploadError;
      rows.push({
        hiring_application_id: application.id,
        officer_id: officer.id,
        evidence_kind: source.kind,
        evidence_role: source.role,
        label: source.label,
        original_filename: basename(source.path),
        mime_type: blob.type || "application/octet-stream",
        byte_size: bytes.byteLength,
        sha256: digest,
        source_bucket: source.bucket,
        source_path: source.path,
        source_record_id: source.sourceId,
        storage_path: destination,
        is_required: source.required,
        archive_kind: archiveKind,
        metadata: source.metadata,
        archived_at: archivedAt,
        created_by: authData.user.id,
      });
    }

    const { data: inserted, error: insertError } = await admin.from("application_evidence_files").upsert(rows, { onConflict: "hiring_application_id,evidence_kind,evidence_role,source_path", ignoreDuplicates: true }).select("*");
    if (insertError) throw insertError;
    const attachments = inserted?.length ? inserted : (await admin.from("application_evidence_files").select("*").eq("hiring_application_id", application.id)).data || [];
    const manifest = attachments.map((item: Record<string, unknown>) => ({
      id: item.id,
      kind: item.evidence_kind,
      role: item.evidence_role,
      label: item.label,
      filename: item.original_filename,
      mimeType: item.mime_type,
      byteSize: item.byte_size,
      sha256: item.sha256,
      archivedAt: item.archived_at,
      archiveKind: item.archive_kind,
    }));
    const applicationData = { ...(application.application_data || {}), attachmentManifest: manifest };
    const completedAt = new Date().toISOString();
    const update: Record<string, unknown> = { evidence_snapshot_status: "complete", evidence_snapshot_completed_at: completedAt, evidence_snapshot_kind: archiveKind, application_data: applicationData };
    if (archiveKind === "submission") Object.assign(update, { status: "submitted", submitted_at: application.submitted_at || completedAt });
    const { error: updateError } = await admin.from("guard_hiring_applications").update(update).eq("id", application.id);
    if (updateError) throw updateError;
    return json({ attachments, manifest, snapshot_status: "complete", archive_kind: archiveKind, completed_at: completedAt });
  } catch (error) {
    console.error("Application evidence archive failed", error);
    if (failureAdmin && failureApplicationId) {
      await failureAdmin.from("guard_hiring_applications").update({ evidence_snapshot_status: "failed" }).eq("id", failureApplicationId);
    }
    return json({ error: error instanceof Error ? error.message : "Could not archive application attachments" }, 500);
  }
});
