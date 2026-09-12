import { useEffect, useMemo, useState } from "react";
import { Archive, Briefcase, Calendar, Download, Eye, FileText, Image as ImageIcon, Loader2, Mail, MapPin, Phone, Printer, ShieldCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generateGuardApplicationPDF, type GuardApplicationData } from "@/lib/generateGuardApplicationPDF";
import { createZip } from "@/lib/createZip";
import { toast } from "sonner";

type ApplicantReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: any;
};

type ReviewData = {
  applicationId: string | null;
  snapshot: GuardApplicationData | null;
  officer: any;
  snapshotStatus: string;
  snapshotKind: "submission" | "legacy" | null;
  snapshotCompletedAt: string | null;
  attachments: EvidenceAttachment[];
  onboardingDocuments: Array<{ label: string; url: string; submittedAt: string }>;
  resumeUrl: string;
};

type EvidenceAttachment = {
  id: string;
  evidence_kind: "photo" | "certification";
  evidence_role: string;
  label: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  storage_path: string;
  archive_kind: "submission" | "legacy";
  archived_at: string;
  metadata: Record<string, any>;
  url: string;
};

const value = (item: unknown) => typeof item === "string" && item.trim() ? item : "Not provided";
const pretty = (item: string) => item.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
const safeFilename = (item: string) => item.replace(/[^a-zA-Z0-9._-]/g, "-");
const formatBytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const formatTime = (item: string) => {
  const [hourText, minute = "00"] = item.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return item;
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
};

const embeddedApplication = (application: any) => {
  const record = Array.isArray(application?.hiring_application)
    ? [...application.hiring_application].sort((left, right) => new Date(right.submitted_at || right.created_at || 0).getTime() - new Date(left.submitted_at || left.created_at || 0).getTime())[0]
    : application?.hiring_application;
  return record || null;
};

export function ApplicantReviewDialog({ open, onOpenChange, application }: ApplicantReviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ label: string; url: string; attachment?: EvidenceAttachment } | null>(null);
  const [review, setReview] = useState<ReviewData>({ applicationId: null, snapshot: null, officer: null, snapshotStatus: "pending", snapshotKind: null, snapshotCompletedAt: null, attachments: [], onboardingDocuments: [], resumeUrl: "" });

  useEffect(() => {
    if (!open || !application?.id || !application?.officer?.id) return;
    let active = true;
    const embedded = embeddedApplication(application);

    setReview({
      applicationId: embedded?.id || null,
      snapshot: embedded?.application_data || null,
      officer: application.officer || null,
      snapshotStatus: embedded?.evidence_snapshot_status || "pending",
      snapshotKind: embedded?.evidence_snapshot_kind || null,
      snapshotCompletedAt: embedded?.evidence_snapshot_completed_at || null,
      attachments: [],
      onboardingDocuments: [],
      resumeUrl: "",
    });
    setLoading(!embedded?.application_data);
    setAttachmentsLoading(true);
    setDocumentsLoading(true);

    (async () => {
      try {
        const officerId = application.officer.id;
        let [snapshotResult, officerResult] = await Promise.all([
          embedded?.id && embedded?.application_data
            ? Promise.resolve({ data: embedded, error: null })
            : (supabase as any).from("guard_hiring_applications").select("id,application_data,status,submitted_at,evidence_snapshot_status,evidence_snapshot_kind,evidence_snapshot_completed_at").eq("job_application_id", application.id).eq("application_type", "employer_copy").maybeSingle(),
          supabase.from("officer_profiles").select("phone,availability_schedule,location").eq("id", officerId).maybeSingle(),
        ]);
        const error = snapshotResult.error || officerResult.error;
        if (error) throw error;

        if (active) {
          const resumePath = snapshotResult.data?.application_data?.resumePath;
          const resumeResult = resumePath ? await supabase.storage.from("resumes").createSignedUrl(resumePath, 3600) : { data: null, error: null };
          setReview(current => ({
            ...current,
            applicationId: snapshotResult.data?.id || current.applicationId,
            snapshot: snapshotResult.data?.application_data || current.snapshot,
            officer: officerResult.data || current.officer,
            snapshotStatus: snapshotResult.data?.evidence_snapshot_status || current.snapshotStatus,
            snapshotKind: snapshotResult.data?.evidence_snapshot_kind || current.snapshotKind,
            snapshotCompletedAt: snapshotResult.data?.evidence_snapshot_completed_at || current.snapshotCompletedAt,
            resumeUrl: resumeResult.data?.signedUrl || "",
          }));
          setLoading(false);
        }

        if (snapshotResult.data?.id && snapshotResult.data.evidence_snapshot_status !== "complete" && snapshotResult.data.evidence_snapshot_kind === "legacy") {
          const legacyResult = await supabase.functions.invoke("archive-application-evidence", { body: { hiring_application_id: snapshotResult.data.id, archive_kind: "legacy" } });
          if (legacyResult.error) console.warn("Legacy evidence could not be archived", legacyResult.error);
          const refreshed = await (supabase as any).from("guard_hiring_applications").select("id,application_data,status,submitted_at,evidence_snapshot_status,evidence_snapshot_kind,evidence_snapshot_completed_at").eq("id", snapshotResult.data.id).single();
          if (!refreshed.error) snapshotResult = refreshed;
        }

        const onboardingPacketPromise = snapshotResult.data?.id
          ? (supabase as any).from("officer_onboarding_packets").select("id,i9_document_path,i9_submitted_at,w4_document_path,w4_submitted_at").eq("hiring_application_id", snapshotResult.data.id).maybeSingle()
          : Promise.resolve({ data: null, error: null });
        const [evidenceResult, onboardingResult] = await Promise.all([
          snapshotResult.data?.id
            ? (supabase as any).from("application_evidence_files").select("*").eq("hiring_application_id", snapshotResult.data.id).order("evidence_kind").order("evidence_role")
            : Promise.resolve({ data: [], error: null }),
          onboardingPacketPromise,
        ]);
        if (evidenceResult.error) throw evidenceResult.error;
        if (onboardingResult.error) throw onboardingResult.error;

        const evidenceFiles = evidenceResult.data || [];
        const evidenceSigned = evidenceFiles.length
          ? await supabase.storage.from("application-evidence").createSignedUrls(evidenceFiles.map((item: any) => item.storage_path), 3600)
          : { data: [], error: null };
        const evidenceUrls = new Map((evidenceSigned.data || []).map((item: any) => [item.path, item.signedUrl]));
        const attachments = evidenceFiles.map((item: any) => ({
          ...item,
          metadata: item.metadata || {},
          url: evidenceUrls.get(item.storage_path) || "",
        })).filter((item: EvidenceAttachment) => item.url) as EvidenceAttachment[];

        if (active) {
          setReview(current => ({
            ...current,
            snapshotStatus: snapshotResult.data?.evidence_snapshot_status || current.snapshotStatus,
            snapshotKind: snapshotResult.data?.evidence_snapshot_kind || current.snapshotKind,
            snapshotCompletedAt: snapshotResult.data?.evidence_snapshot_completed_at || current.snapshotCompletedAt,
            attachments,
          }));
          setAttachmentsLoading(false);
        }

        const onboardingDocuments: ReviewData["onboardingDocuments"] = [];
        if (snapshotResult.data?.id && onboardingResult.data?.id) {
          const records = onboardingResult.data?.id ? await (supabase as any).from("officer_compliance_documents").select("id,document_label,document_type,version,storage_path,sha256,signed_at,submitted_at").eq("packet_id", onboardingResult.data.id).order("submitted_at", { ascending: false }) : { data: [], error: null };
          if (records.error) throw records.error;
          const documentEntries = (records.data || []).map((document: any) => ({ path: document.storage_path, label: `${document.document_label} (v${document.version})`, submittedAt: document.submitted_at }));
          for (const document of records.data || []) void (supabase as any).rpc("log_sensitive_access", { _action: "view", _table_name: "officer_compliance_documents", _record_id: document.id, _details: { document_type: document.document_type, officer_id: officerId } });
          if (!(records.data || []).some((document: any) => document.document_type === "form-i9") && onboardingResult.data?.i9_document_path && onboardingResult.data?.i9_submitted_at) {
            documentEntries.push({ path: onboardingResult.data.i9_document_path, label: "Signed Form I-9 (legacy)", submittedAt: onboardingResult.data.i9_submitted_at });
          }
          if (!(records.data || []).some((document: any) => document.document_type === "form-w4") && onboardingResult.data?.w4_document_path && onboardingResult.data?.w4_submitted_at) {
            documentEntries.push({ path: onboardingResult.data.w4_document_path, label: "Signed Form W-4 (legacy)", submittedAt: onboardingResult.data.w4_submitted_at });
          }
          const signedDocuments = documentEntries.length
            ? await supabase.storage.from("onboarding-documents").createSignedUrls(documentEntries.map((document: any) => document.path), 3600)
            : { data: [], error: null };
          const documentUrls = new Map((signedDocuments.data || []).map((item: any) => [item.path, item.signedUrl]));
          documentEntries.forEach((document: any) => {
            const url = documentUrls.get(document.path);
            if (url) onboardingDocuments.push({ label: document.label, url, submittedAt: document.submittedAt });
          });
        }

        if (active) setReview(current => ({ ...current, onboardingDocuments }));
      } catch (error: any) {
        console.error("Applicant review failed", error);
        toast.error("Could not load the complete applicant record");
      } finally {
        if (active) {
          setLoading(false);
          setAttachmentsLoading(false);
          setDocumentsLoading(false);
        }
      }
    })();
    return () => { active = false; };
  }, [open, application?.id]);

  const data = review.snapshot;
  const schedule = (data as any)?.availability?.schedule || review.officer?.availability_schedule || {};
  const workHistory = data?.workHistory || [];
  const photos = review.attachments.filter(item => item.evidence_kind === "photo");
  const certifications = review.attachments.filter(item => item.evidence_kind === "certification");
  const title = application?.officerName || data?.applicantName || "Applicant";
  const applicationReady = Boolean(data);
  const download = (mode: "download" | "print") => {
    if (!data) {
      toast.error("The submitted application PDF is not available");
      return;
    }
    void generateGuardApplicationPDF(data, mode);
  };

  const logEvidenceAction = (action: string, recordId: string, details: Record<string, unknown>) => {
    void (supabase as any).rpc("log_sensitive_access", { _action: action, _table_name: "application_evidence_files", _record_id: recordId, _details: details });
  };
  const downloadEvidence = async (attachment: EvidenceAttachment) => {
    setDownloadingAttachmentId(attachment.id);
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error(`Could not download ${attachment.label}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = safeFilename(attachment.original_filename || attachment.label);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      logEvidenceAction("download", attachment.id, { hiring_application_id: review.applicationId, evidence_kind: attachment.evidence_kind });
    } catch (error: any) {
      toast.error(error.message || "Could not download this file");
    } finally {
      setDownloadingAttachmentId(null);
    }
  };
  const previewEvidence = (attachment: EvidenceAttachment) => {
    logEvidenceAction("preview", attachment.id, { hiring_application_id: review.applicationId, evidence_kind: attachment.evidence_kind });
    setPreviewDocument({ label: attachment.label, url: attachment.url, attachment });
  };
  const downloadAll = async (kind?: "photo" | "certification") => {
    const selectedAttachments = kind ? review.attachments.filter(item => item.evidence_kind === kind) : review.attachments;
    if (!selectedAttachments.length) return;
    setDownloadingAll(true);
    try {
      const files = await Promise.all(selectedAttachments.map(async (attachment) => {
        const response = await fetch(attachment.url);
        if (!response.ok) throw new Error(`Could not download ${attachment.label}`);
        const folder = attachment.evidence_kind === "photo" ? "Photos" : "Certifications";
        return { name: `${folder}/${safeFilename(`${attachment.label}-${attachment.original_filename}`)}`, data: await response.blob() };
      }));
      files.push({ name: "attachment-manifest.json", data: new Blob([JSON.stringify(selectedAttachments.map(({ url, ...attachment }) => attachment), null, 2)], { type: "application/json" }) });
      const archive = await createZip(files);
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilename(title)}-${kind === "photo" ? "photos" : kind === "certification" ? "certificates" : "application-attachments"}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const snapshotId = review.applicationId || review.attachments[0].id;
      logEvidenceAction("download_bundle", snapshotId, { attachment_count: selectedAttachments.length, evidence_kind: kind || "all" });
      toast.success("Application attachments downloaded");
    } catch (error: any) {
      toast.error(error.message || "Could not download all attachments");
    } finally {
      setDownloadingAll(false);
    }
  };

  const contactRows = useMemo(() => [
    { icon: Mail, label: "Email", value: data?.email },
    { icon: Phone, label: "Phone", value: data?.phone || review.officer?.phone },
    { icon: MapPin, label: "Address", value: data ? [data.address, data.city, data.state, data.zip].filter(Boolean).join(", ") : review.officer?.location },
    { icon: Briefcase, label: "Position", value: data?.position || application?.job_posting?.title },
  ], [data, review.officer, application]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto p-0">
      <DialogHeader className="sticky top-0 z-20 border-b bg-background/95 px-5 py-5 backdrop-blur sm:px-8">
        <div className="flex flex-col gap-4 pr-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <DialogTitle className="text-2xl">{title}</DialogTitle>
            <DialogDescription>Complete applicant review for {application?.job_posting?.title || "your position"}</DialogDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {review.resumeUrl && <Button asChild variant="outline"><a href={review.resumeUrl} download target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" />Download Resume</a></Button>}
            <Button variant="outline" disabled={!applicationReady} onClick={() => download("print")}><Printer className="mr-2 h-4 w-4" />Print PDF</Button>
            <Button disabled={!applicationReady} onClick={() => download("download")}><Download className="mr-2 h-4 w-4" />Download PDF</Button>
            <Button variant="outline" disabled={!review.attachments.some(item => item.evidence_kind === "photo") || downloadingAll} onClick={() => void downloadAll("photo")}><Archive className="mr-2 h-4 w-4" />{downloadingAll ? "Preparing…" : "Download Photos"}</Button>
            <Button variant="outline" disabled={!review.attachments.some(item => item.evidence_kind === "certification") || downloadingAll} onClick={() => void downloadAll("certification")}><Archive className="mr-2 h-4 w-4" />{downloadingAll ? "Preparing…" : "Download Certificates"}</Button>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-6 p-5 sm:p-8">
        {loading ? <div className="py-20 text-center text-muted-foreground">Loading the complete application…</div> : <>
          {review.snapshotKind === "legacy" && review.snapshotStatus === "complete" && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">Legacy attachment archive</p><p className="mt-1">These are the officer files available when this archive was created{review.snapshotCompletedAt ? ` on ${new Date(review.snapshotCompletedAt).toLocaleString()}` : ""}. They are not represented as the original files from the earlier application date.</p></div>}
          {review.snapshotStatus === "legacy_unavailable" && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">No legacy attachments were available</p><p className="mt-1">This older application has no preserved photo or certification files. Current profile files are intentionally not substituted.</p></div>}
          {review.snapshotStatus !== "complete" && review.snapshotKind !== "legacy" && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">Attachment archive is still processing</p><p className="mt-1">The application is available now. Any optional photos or credentials are still being preserved.</p></div>}
          {review.attachments.length > 0 && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><p className="font-semibold">Photos and certificates are stored separately</p><p className="mt-1">They are not embedded in the application PDF. Preview files below or use the separate photo and certificate downloads above.</p></div>}
          <Card className="overflow-hidden border-primary/20 bg-primary/5">
            <CardContent className="grid gap-5 p-5 sm:grid-cols-[140px_1fr] sm:p-6">
              <div className="flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl border bg-background sm:w-36">
                {photos.find(photo => photo.evidence_role === "headshot") ? <img className="h-full w-full object-cover" src={photos.find(photo => photo.evidence_role === "headshot")!.url} alt={`${title} headshot`} /> : <User className="h-14 w-14 text-muted-foreground" />}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {contactRows.map(item => <div key={item.label} className="rounded-xl bg-background p-4"><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><item.icon className="h-4 w-4" />{item.label}</div><p className="break-words font-medium">{value(item.value)}</p></div>)}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Application answers" icon={ShieldCheck}>
              <Info label="Hiring company" content={data?.companyName} />
              <Info label="Available start date" content={data?.startDate} />
              <Info label="Eligible to work in the U.S." content={data?.eligibleToWork} />
              <Info label="18 or older" content={data?.isAdult} />
              <Info label="Valid driver's license" content={data?.driversLicense} />
              <Info label="Education" content={data?.education} wide />
              <Info label="Skills and training" content={data?.skills} wide />
              <Info label="Electronic signature" content={data?.signature} />
              <Info label="Date signed" content={data?.signatureDate} />
            </Section>

            <Section title="Weekly availability" icon={Calendar}>
              {Object.entries(schedule).filter(([, hours]: any) => hours?.start && hours?.end).length ? Object.entries(schedule).map(([day, hours]: [string, any]) => hours?.start && hours?.end ? <div key={day} className="flex items-center justify-between rounded-lg border px-4 py-3"><span className="font-medium">{pretty(day)}</span><span className="text-muted-foreground">{formatTime(hours.start)} – {formatTime(hours.end)}</span></div> : null) : <Empty text="No availability schedule provided" />}
            </Section>
          </div>

          <Section title="Applicant photos" icon={ImageIcon}>
            {attachmentsLoading ? <LoadingState text="Loading preserved photos…" /> : photos.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{photos.map(photo => <div key={photo.id} className="overflow-hidden rounded-xl border bg-card"><button type="button" className="group block w-full" onClick={() => previewEvidence(photo)}><img src={photo.url} alt={photo.label} className="h-52 w-full object-cover transition-transform group-hover:scale-[1.02]" /></button><div className="space-y-2 p-3"><p className="text-sm font-semibold">{photo.label}</p><p className="text-xs text-muted-foreground">{formatBytes(photo.byte_size)}</p><div className="flex gap-2"><Button type="button" size="sm" className="flex-1" onClick={() => previewEvidence(photo)}><Eye className="mr-2 h-4 w-4" />View</Button><Button type="button" size="sm" variant="outline" disabled={downloadingAttachmentId === photo.id} onClick={() => void downloadEvidence(photo)}><Download className="mr-2 h-4 w-4" />{downloadingAttachmentId === photo.id ? "Saving…" : "Download"}</Button></div></div></div>)}</div> : <Empty text="No preserved applicant photos are available" />}
          </Section>

          {(documentsLoading || review.onboardingDocuments.length > 0) && <Section title="Submitted employee documents" icon={FileText}>
            {documentsLoading ? <LoadingState text="Loading submitted documents…" /> : <div className="grid gap-3 md:grid-cols-2">{review.onboardingDocuments.map(document => <div key={document.label} className="flex flex-col gap-3 rounded-xl border bg-green-50/60 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{document.label}</p><p className="text-sm text-muted-foreground">Submitted {new Date(document.submittedAt).toLocaleString()}</p></div><div className="flex gap-2"><Button type="button" size="sm" onClick={() => setPreviewDocument({ label: document.label, url: document.url })}><Eye className="mr-2 h-4 w-4" />View</Button><Button asChild type="button" size="sm" variant="outline"><a href={document.url} download target="_blank" rel="noreferrer" aria-label={`Download ${document.label}`}><Download className="h-4 w-4" /></a></Button></div></div>)}</div>}
          </Section>}

          <Section title="Licenses and certifications" icon={FileText}>
            {attachmentsLoading ? <LoadingState text="Loading preserved certifications…" /> : certifications.length ? <div className="grid gap-4 md:grid-cols-2">{certifications.map(cert => <div key={cert.id} className="rounded-xl border p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><p className="font-semibold">{cert.metadata?.name || cert.label}</p><p className="text-sm text-muted-foreground">{cert.metadata?.certificationNumber || "No license number"}</p></div><Badge variant="secondary">{pretty(cert.metadata?.side || "document")}</Badge></div><div className="mb-3 grid grid-cols-2 gap-3 text-sm"><Info label="Issued" content={cert.metadata?.issueDate} /><Info label="Expires" content={cert.metadata?.expiryDate} /></div><p className="mb-3 break-all text-xs text-muted-foreground">SHA-256: {cert.sha256}</p><div className="flex gap-2"><Button type="button" size="sm" onClick={() => previewEvidence(cert)}><Eye className="mr-2 h-4 w-4" />View</Button><Button type="button" size="sm" variant="outline" disabled={downloadingAttachmentId === cert.id} onClick={() => void downloadEvidence(cert)}><Download className="mr-2 h-4 w-4" />{downloadingAttachmentId === cert.id ? "Saving…" : "Download"}</Button></div></div>)}</div> : <Empty text="No preserved license or certification documents are available" />}
          </Section>

          <Section title="Work history" icon={Briefcase}>
            {workHistory.length ? <div className="grid gap-4 md:grid-cols-2">{workHistory.map((job: any, index: number) => <div key={job.id || index} className="rounded-xl border p-4"><p className="font-semibold">{job.company_name || job.employer || "Employer"}</p><p className="text-sm text-muted-foreground">{job.position_title || job.title || "Position not provided"}</p><p className="mt-2 text-sm">{[job.start_date || job.startDate, job.end_date || job.endDate].filter(Boolean).join(" – ") || "Dates not provided"}</p>{(job.supervisor_name || job.supervisor) && <p className="mt-2 text-sm">Supervisor: {job.supervisor_name || job.supervisor}</p>}</div>)}</div> : <Empty text="No work history was provided" />}
          </Section>

          <Section title="Professional references" icon={User}>
            {data?.references?.some(reference => reference.name) ? <div className="grid gap-4 md:grid-cols-3">{data.references.filter(reference => reference.name).map((reference, index) => <div key={index} className="rounded-xl border p-4"><p className="font-semibold">{reference.name}</p><p className="text-sm text-muted-foreground">{reference.relationship || "Relationship not provided"}</p><p className="mt-2 text-sm">{reference.phone || reference.email || "No contact information"}</p></div>)}</div> : <Empty text="No professional references were provided" />}
          </Section>
        </>}
      </div>

      <Dialog open={Boolean(previewDocument)} onOpenChange={(nextOpen) => { if (!nextOpen) setPreviewDocument(null); }}>
        <DialogContent className="flex h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="truncate">{previewDocument?.label}</DialogTitle>
                <DialogDescription>View the submitted document without leaving the applicant review.</DialogDescription>
              </div>
              {previewDocument?.attachment ? <Button type="button" size="sm" variant="outline" disabled={downloadingAttachmentId === previewDocument.attachment.id} onClick={() => void downloadEvidence(previewDocument.attachment!)}><Download className="mr-2 h-4 w-4" />{downloadingAttachmentId === previewDocument.attachment.id ? "Saving…" : "Download"}</Button> : previewDocument && <Button asChild size="sm" variant="outline"><a href={previewDocument.url} download target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" />Download</a></Button>}
            </div>
          </DialogHeader>
          {previewDocument && <iframe src={previewDocument.url} title={previewDocument.label} className="min-h-0 flex-1 bg-muted" />}
        </DialogContent>
      </Dialog>
    </DialogContent>
  </Dialog>;
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return <Card><CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5 text-primary" />{title}</CardTitle></CardHeader><CardContent className="space-y-3 p-5 sm:p-6">{children}</CardContent></Card>;
}

function Info({ label, content, wide = false }: { label: string; content: unknown; wide?: boolean }) {
  return <div className={wide ? "sm:col-span-2" : ""}><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{value(content)}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

function LoadingState({ text }: { text: string }) {
  return <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{text}</div>;
}
