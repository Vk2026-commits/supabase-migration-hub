import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const sections = ["Profile", "Availability", "Photos", "Licenses and certificates", "Work history"];
const photoLabels: Record<string, string> = { headshot: "Professional headshot", "full-body": "Full body", "action-1": "Action photo 1", "action-2": "Action photo 2" };

const filled = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";
function Field({ label, value }: { label: string; value: unknown }) {
  const present = filled(value);
  return <div className="min-w-0"><dt className="mb-2 text-sm font-medium text-slate-600">{label}</dt><dd className={`min-h-11 whitespace-pre-wrap break-words rounded-lg border px-3 py-3 text-sm ${present ? "border-slate-200 bg-slate-50 text-slate-900" : "border-dashed border-amber-300 bg-amber-50/60 text-amber-800"}`}>{present ? String(value) : "Not provided"}</dd></div>;
}
function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-200 bg-slate-50/80 px-5 py-5"><h3 className="text-lg font-semibold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></header><div className="p-5 sm:p-6">{children}</div></section>;
}
const readable = (value: string) => ({ full_time: "Full-time", part_time: "Part-time", seasonal: "Seasonal", first_shift: "First shift (day)", second_shift: "Second shift (evening)", third_shift: "Third shift (night)", weekends: "Weekends" }[value] || value.replaceAll("_", " "));
const time = (value?: string) => { if (!value) return "Not provided"; const [hour, minute] = value.split(":"); const h = Number(hour); return Number.isFinite(h) ? `${h % 12 || 12}:${minute || "00"} ${h >= 12 ? "PM" : "AM"}` : value; };

export function OfficerProfileDetails({ officerId }: { officerId: string }) {
  const [record, setRecord] = useState<any>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const bounded = <T,>(task: PromiseLike<T>): Promise<T> => Promise.race([
      Promise.resolve(task),
      new Promise<never>((_, reject) => timers.push(setTimeout(() => reject(new Error("Request timed out")), 15000))),
    ]);
    const update = (patch: any) => { if (active) setRecord((current: any) => current ? { ...current, ...patch } : current); };
    setRecord(null); setError("");
    void (async () => {
      try {
        const profile = await bounded(supabase.from("officer_profiles").select("user_id,title,bio,location,phone,years_experience,availability_status,availability_schedule,employment_type,shift_preference,address_street,address_unit,address_city,address_state,address_zip,desired_salary,linkedin_url,resume_url").eq("id", officerId).abortSignal(controller.signal).single());
        if (profile.error || !profile.data) throw new Error("The officer profile could not be loaded.");
        if (!active) return;
        setRecord({ profile: profile.data, certificates: [], history: [], photos: [], certificatesLoading: true, historyLoading: true, photosLoading: true });
        // Each optional section settles independently; media never blocks profile details.
        void bounded(supabase.from("certifications").select("*").eq("officer_id", officerId).abortSignal(controller.signal))
          .then(result => update({ certificates: result.data || [], certificateError: !!result.error }))
          .catch(() => update({ certificateError: true }))
          .finally(() => update({ certificatesLoading: false }));
        void bounded(supabase.from("work_history").select("*").eq("officer_id", officerId).order("start_date", { ascending: false }).abortSignal(controller.signal))
          .then(result => update({ history: result.data || [], historyError: !!result.error }))
          .catch(() => update({ historyError: true }))
          .finally(() => update({ historyLoading: false }));
        void (async () => {
          try {
            const listing: any = await bounded((supabase as any).rpc("list_visible_officer_photos", { _user_id: profile.data.user_id }).abortSignal(controller.signal));
            if (listing.error) throw listing.error;
            const files = (listing.data || []).filter((file: { name: string }) => photoLabels[file.name.split(".")[0]]);
            const signed = files.length ? await bounded(supabase.storage.from("officer-photos").createSignedUrls(files.map((file: { name: string }) => `${profile.data.user_id}/${file.name}`), 3600)) : { data: [], error: null };
            if (signed.error) throw signed.error;
            update({ photos: signed.data || [] });
          } catch { update({ photoError: true }); }
          finally { update({ photosLoading: false }); }
        })();
      } catch { if (active) setError("The officer profile could not be loaded. Please retry."); }
    })();
    return () => { active = false; timers.forEach(clearTimeout); controller.abort(); };
  }, [officerId, attempt]);
  if (error) return <div role="alert">{error} <button className="text-primary underline" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>;
  if (!record) return <p role="status">Loading officer profile…</p>;
  const { profile, certificates, history, photos } = record;
  const profileFields: [string, unknown][] = [
    ["Professional title", profile.title], ["Phone", profile.phone],
    ["Years of experience", profile.years_experience], ["Home address", profile.address_street],
    ["Apartment / unit (optional)", profile.address_unit], ["City", profile.address_city],
    ["State", profile.address_state], ["ZIP code", profile.address_zip],
    ["Desired annual salary", profile.desired_salary == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(profile.desired_salary)],
    ["LinkedIn profile (optional)", profile.linkedin_url], ["Professional bio", profile.bio],
    ["Resume", profile.resume_url ? "File provided" : null],
  ];
  const completed = profileFields.filter(([, value]) => filled(value)).length;
  return <Tabs defaultValue="Profile" className="min-w-0 space-y-5">
    <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-slate-50 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Officer record · Read only</p><h2 className="mt-2 text-2xl font-bold text-slate-900">Profile details</h2><p className="mt-2 max-w-xl text-sm text-slate-600">Review the officer’s saved answers in the same sections they fill out. Amber fields show information not provided.</p></div><span className="rounded-full border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-800">{completed} of {profileFields.length} profile fields provided</span></div>
      <p className="mt-3 text-xs text-slate-500">Includes optional fields. This is a record summary, not an application approval or completion requirement.</p>
    </div>
    <TabsList className="flex h-auto flex-wrap justify-start gap-1 rounded-xl bg-slate-100 p-2">{sections.map((section, index) => <TabsTrigger className="min-h-11 gap-2 rounded-lg px-4 data-[state=active]:text-blue-700" key={section} value={section}><span className="text-xs opacity-60">0{index + 1}</span>{section}</TabsTrigger>)}</TabsList>
    <TabsContent value="Profile"><Panel title="Professional profile" description="Contact details, experience, and professional background saved by the officer."><dl className="grid gap-5 sm:grid-cols-2">{profileFields.map(([label, value]) => <Field key={label} label={label} value={value} />)}</dl></Panel></TabsContent>
    <TabsContent value="Availability"><Panel title="Weekly availability" description="Preferred employment type, shifts, and the hours entered for each day."><dl className="mb-6 grid gap-5 sm:grid-cols-2"><Field label="Employment type preference" value={profile.employment_type?.map(readable).join(", ")} /><Field label="Preferred shift" value={profile.shift_preference?.map(readable).join(", ")} /></dl><div className="space-y-3">{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => { const schedule = profile.availability_schedule?.[day] ?? profile.availability_schedule?.[day.toLowerCase()]; return <div key={day} className="grid items-center gap-4 rounded-xl border bg-slate-50/60 p-4 sm:grid-cols-[140px_1fr_1fr]"><div><p className="font-semibold text-slate-900">{day}</p><p className="mt-1 text-xs text-slate-500">{schedule?.start && schedule?.end ? "Hours provided" : "No complete hours entered"}</p></div><dl><Field label="Start time" value={schedule?.start ? time(schedule.start) : null} /></dl><dl><Field label="End time" value={schedule?.end ? time(schedule.end) : null} /></dl></div>; })}</div></Panel></TabsContent>
    <TabsContent value="Photos"><Panel title="Photo checklist" description="Saved photos appear in their original upload slots. Select a preview to open it.">{record.photosLoading ? <p role="status">Loading photos…</p> : record.photoError ? <p role="alert">Photos could not be loaded. Reopen the profile to retry.</p> : <div className="grid gap-5 sm:grid-cols-2">{Object.entries(photoLabels).map(([type, label]) => { const photo = photos.find((item: any) => item.path?.split("/").pop()?.split(".")[0] === type); return <figure key={type} className="overflow-hidden rounded-xl border bg-slate-50"><figcaption className="flex flex-wrap items-center justify-between gap-2 border-b bg-white p-4"><span className="font-semibold">{label}</span><span className={`rounded-full px-2 py-1 text-xs ${photo ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{photo ? "File provided" : "Not provided"}</span></figcaption><div className="flex min-h-64 items-center justify-center p-4">{photo?.signedUrl ? <a className="w-full" href={photo.signedUrl} target="_blank" rel="noopener noreferrer"><img src={photo.signedUrl} alt={label} className="h-72 w-full rounded-lg object-contain" /></a> : <p className="text-sm text-slate-500">{photo ? "Preview unavailable" : "No photo uploaded in this slot"}</p>}</div></figure>; })}</div>}</Panel></TabsContent>
    <TabsContent value="Licenses and certificates" className="space-y-5">{record.certificatesLoading ? <p role="status">Loading credentials…</p> : record.certificateError ? <p role="alert">Credentials could not be loaded.</p> : !certificates.length ? <Panel title="Licenses and certificates" description="No license or certification entries have been provided."><Field label="Credential records" value={null} /></Panel> : certificates.map((certificate: any) => <Panel key={certificate.id} title={certificate.name} description="Officer-provided credential details. Uploaded documents are not proof of verification."><dl className="grid gap-5 sm:grid-cols-2">{[["License number", certificate.certification_number || certificate.credential_id], ["Issuing organization", certificate.issuing_organization], ["Certification date", certificate.issue_date], ["Expiration date", certificate.expiry_date], ["Front of license", certificate.document_front_url ? "File provided" : null], ["Back of license", certificate.document_back_url ? "File provided" : null]].map(([label, value]) => <Field key={label} label={label} value={value} />)}</dl></Panel>)}</TabsContent>
    <TabsContent value="Work history" className="space-y-5">{record.historyLoading ? <p role="status">Loading work history…</p> : record.historyError ? <p role="alert">Work history could not be loaded.</p> : !history.length ? <Panel title="Work history" description="No previous employers have been provided."><Field label="Previous employers" value={null} /></Panel> : history.map((job: any, index: number) => <Panel key={job.id} title={`Employer ${index + 1} · ${job.company_name}`} description="Saved employment entry, including fields the officer left blank."><dl className="grid gap-5 sm:grid-cols-2">{[["Company name", job.company_name], ["Position title", job.position_title], ["Start date", job.start_date], ["End date", job.end_date], ["Company address", job.company_address], ["City", job.company_city], ["State", job.company_state], ["ZIP code", job.company_zip], ["Company phone", job.company_phone], ["Supervisor name", job.supervisor_name], ["Supervisor phone", job.supervisor_phone], ["May contact employer", job.may_contact == null ? null : job.may_contact ? "Yes" : "No"], ["Job description", job.job_description], ["Reason for leaving", job.reason_for_leaving]].map(([label, value]) => <Field key={label} label={label} value={value} />)}</dl></Panel>)}</TabsContent>
  </Tabs>;
}
