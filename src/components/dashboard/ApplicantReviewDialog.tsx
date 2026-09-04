import { useEffect, useMemo, useState } from "react";
import { Briefcase, Calendar, Download, FileText, Image as ImageIcon, Mail, MapPin, Phone, Printer, ShieldCheck, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { generateGuardApplicationPDF, type GuardApplicationData } from "@/lib/generateGuardApplicationPDF";
import { toast } from "sonner";

type ApplicantReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: any;
};

type ReviewData = {
  snapshot: GuardApplicationData | null;
  officer: any;
  certifications: any[];
  workHistory: any[];
  photos: Array<{ name: string; label: string; url: string }>;
  documentUrls: Record<string, string>;
};

const photoLabels: Record<string, string> = {
  headshot: "Professional headshot",
  "full-body": "Full-body photo",
  "action-1": "Action photo 1",
  "action-2": "Action photo 2",
};

const value = (item: unknown) => typeof item === "string" && item.trim() ? item : "Not provided";
const pretty = (item: string) => item.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
const formatTime = (item: string) => {
  const [hourText, minute = "00"] = item.split(":");
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return item;
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
};

export function ApplicantReviewDialog({ open, onOpenChange, application }: ApplicantReviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<ReviewData>({ snapshot: null, officer: null, certifications: [], workHistory: [], photos: [], documentUrls: {} });

  useEffect(() => {
    if (!open || !application?.id || !application?.officer?.id) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const officerId = application.officer.id;
        const officerUserId = application.officer.user_id;
        const [snapshotResult, officerResult, certificationsResult, workResult, photoFilesResult] = await Promise.all([
          (supabase as any).from("guard_hiring_applications").select("application_data,status,submitted_at").eq("job_application_id", application.id).eq("application_type", "employer_copy").maybeSingle(),
          supabase.from("officer_profiles").select("*").eq("id", officerId).maybeSingle(),
          supabase.from("certifications").select("*").eq("officer_id", officerId).order("created_at", { ascending: false }),
          supabase.from("work_history").select("*").eq("officer_id", officerId).order("start_date", { ascending: false }),
          supabase.storage.from("officer-photos").list(officerUserId, { limit: 100 }),
        ]);
        const error = snapshotResult.error || officerResult.error || certificationsResult.error || workResult.error || photoFilesResult.error;
        if (error) throw error;

        const photos = (await Promise.all((photoFilesResult.data || []).map(async (file: any) => {
          const path = `${officerUserId}/${file.name}`;
          const signed = await supabase.storage.from("officer-photos").createSignedUrl(path, 3600);
          if (signed.error || !signed.data?.signedUrl) return null;
          const key = file.name.split(".")[0];
          return { name: key, label: photoLabels[key] || pretty(key), url: signed.data.signedUrl };
        }))).filter(Boolean) as ReviewData["photos"];

        const documentUrls: Record<string, string> = {};
        for (const certification of certificationsResult.data || []) {
          for (const side of ["front", "back"] as const) {
            const path = certification[`document_${side}_url`];
            if (!path) continue;
            const cleanPath = path.startsWith("http") ? path.split("certification-documents/").pop() : path;
            if (!cleanPath) continue;
            const signed = await supabase.storage.from("certification-documents").createSignedUrl(cleanPath, 3600);
            if (!signed.error && signed.data?.signedUrl) documentUrls[`${certification.id}-${side}`] = signed.data.signedUrl;
          }
        }

        if (active) setReview({
          snapshot: snapshotResult.data?.application_data || application.hiring_application?.[0]?.application_data || null,
          officer: officerResult.data,
          certifications: certificationsResult.data || [],
          workHistory: workResult.data || [],
          photos,
          documentUrls,
        });
      } catch (error: any) {
        console.error("Applicant review failed", error);
        toast.error("Could not load the complete applicant record");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, application?.id]);

  const data = review.snapshot;
  const schedule = (data as any)?.availability?.schedule || review.officer?.availability_schedule || {};
  const workHistory = review.workHistory.length ? review.workHistory : (data?.workHistory || []);
  const title = application?.officerName || data?.applicantName || "Applicant";
  const applicationReady = Boolean(data);
  const download = (mode: "download" | "print") => {
    if (!data) {
      toast.error("The submitted application PDF is not available");
      return;
    }
    void generateGuardApplicationPDF(data, mode);
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
            <Button variant="outline" disabled={!applicationReady} onClick={() => download("print")}><Printer className="mr-2 h-4 w-4" />Print PDF</Button>
            <Button disabled={!applicationReady} onClick={() => download("download")}><Download className="mr-2 h-4 w-4" />Download PDF</Button>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-6 p-5 sm:p-8">
        {loading ? <div className="py-20 text-center text-muted-foreground">Loading the complete application…</div> : <>
          <Card className="overflow-hidden border-primary/20 bg-primary/5">
            <CardContent className="grid gap-5 p-5 sm:grid-cols-[140px_1fr] sm:p-6">
              <div className="flex h-36 w-full items-center justify-center overflow-hidden rounded-2xl border bg-background sm:w-36">
                {review.photos.find(photo => photo.name === "headshot") ? <img className="h-full w-full object-cover" src={review.photos.find(photo => photo.name === "headshot")!.url} alt={`${title} headshot`} /> : <User className="h-14 w-14 text-muted-foreground" />}
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
            {review.photos.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{review.photos.map(photo => <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border bg-card"><img src={photo.url} alt={photo.label} className="h-52 w-full object-cover transition-transform group-hover:scale-[1.02]" /><p className="p-3 text-sm font-semibold">{photo.label}</p></a>)}</div> : <Empty text="No applicant photos are available" />}
          </Section>

          <Section title="Licenses and certifications" icon={FileText}>
            {review.certifications.length ? <div className="grid gap-4 md:grid-cols-2">{review.certifications.map(cert => <div key={cert.id} className="rounded-xl border p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><p className="font-semibold">{cert.name || pretty(cert.license_level || "Certification")}</p><p className="text-sm text-muted-foreground">{cert.certification_number || "No license number"}</p></div><Badge variant="secondary">{pretty(cert.certification_type || "certificate")}</Badge></div><div className="mb-3 grid grid-cols-2 gap-3 text-sm"><Info label="Issued" content={cert.issue_date} /><Info label="Expires" content={cert.expiry_date} /></div><div className="flex flex-wrap gap-2">{(["front", "back"] as const).map(side => review.documentUrls[`${cert.id}-${side}`] ? <Button key={side} asChild size="sm" variant="outline"><a href={review.documentUrls[`${cert.id}-${side}`]} target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" />{pretty(side)} document</a></Button> : null)}</div></div>)}</div> : <Empty text="No licenses or certification documents are available" />}
          </Section>

          <Section title="Work history" icon={Briefcase}>
            {workHistory.length ? <div className="grid gap-4 md:grid-cols-2">{workHistory.map((job: any, index: number) => <div key={job.id || index} className="rounded-xl border p-4"><p className="font-semibold">{job.company_name || job.employer || "Employer"}</p><p className="text-sm text-muted-foreground">{job.position_title || job.title || "Position not provided"}</p><p className="mt-2 text-sm">{[job.start_date || job.startDate, job.end_date || job.endDate].filter(Boolean).join(" – ") || "Dates not provided"}</p>{(job.supervisor_name || job.supervisor) && <p className="mt-2 text-sm">Supervisor: {job.supervisor_name || job.supervisor}</p>}</div>)}</div> : <Empty text="No work history was provided" />}
          </Section>

          <Section title="Professional references" icon={User}>
            {data?.references?.some(reference => reference.name) ? <div className="grid gap-4 md:grid-cols-3">{data.references.filter(reference => reference.name).map((reference, index) => <div key={index} className="rounded-xl border p-4"><p className="font-semibold">{reference.name}</p><p className="text-sm text-muted-foreground">{reference.relationship || "Relationship not provided"}</p><p className="mt-2 text-sm">{reference.phone || reference.email || "No contact information"}</p></div>)}</div> : <Empty text="No professional references were provided" />}
          </Section>
        </>}
      </div>
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
