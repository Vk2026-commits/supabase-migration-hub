import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const sections = ["Profile", "Availability", "Photos", "Licenses and certificates", "Work history"];
const photoLabels: Record<string, string> = { headshot: "Professional headshot", "full-body": "Full body", "action-1": "Action photo 1", "action-2": "Action photo 2" };

export function OfficerProfileDetails({ officerId }: { officerId: string }) {
  const [record, setRecord] = useState<any>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); if (active) setError("The profile took too long to load. Please retry."); }, 15000);
    setRecord(null); setError("");
    void (async () => {
      try {
        const [profile, certificates, history] = await Promise.all([
          supabase.from("officer_profiles").select("user_id,title,bio,location,phone,years_experience,availability_status,availability_schedule,employment_type,shift_preference").eq("id", officerId).abortSignal(controller.signal).single(),
          supabase.from("certifications").select("*").eq("officer_id", officerId).abortSignal(controller.signal),
          supabase.from("work_history").select("*").eq("officer_id", officerId).order("start_date", { ascending: false }).abortSignal(controller.signal),
        ]);
        if (profile.error || !profile.data) throw new Error("The officer profile could not be loaded.");
        // Storage policies enforce the viewing company's existing access.
        const listing = await supabase.storage.from("officer-photos").list(profile.data.user_id);
        const files = (listing.data || []).filter(file => photoLabels[file.name.split(".")[0]]);
        const signed = files.length ? await supabase.storage.from("officer-photos").createSignedUrls(files.map(file => `${profile.data.user_id}/${file.name}`), 3600) : { data: [], error: null };
        if (active && !controller.signal.aborted) setRecord({ profile: profile.data, certificates: certificates.data || [], certificateError: !!certificates.error, history: history.data || [], historyError: !!history.error, photos: signed.data || [], photoError: !!listing.error || !!signed.error });
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Unable to load profile."); }
      finally { clearTimeout(timer); }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [officerId, attempt]);
  if (error) return <div role="alert">{error} <button className="text-primary underline" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>;
  if (!record) return <p role="status">Loading officer profile…</p>;
  const { profile, certificates, history, photos } = record;
  return <Tabs defaultValue="Profile" className="min-w-0 space-y-5">
    <TabsList className="flex h-auto flex-wrap justify-start">{sections.map(section => <TabsTrigger key={section} value={section}>{section}</TabsTrigger>)}</TabsList>
    <TabsContent value="Profile" className="space-y-5"><h2 className="text-xl font-bold">Professional profile</h2><p className="whitespace-pre-line">{profile.bio || "No biography provided."}</p><dl className="grid gap-4 sm:grid-cols-2">{[["Title", profile.title], ["Location", profile.location], ["Phone", profile.phone], ["Experience", profile.years_experience == null ? "" : `${profile.years_experience} years`]].map(([label, value]) => <div key={label} className="rounded-lg border p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value || "Not provided"}</dd></div>)}</dl></TabsContent>
    <TabsContent value="Availability" className="space-y-4"><h2 className="text-xl font-bold">Weekly availability</h2><p>Employment preference: {profile.employment_type?.join(", ") || "Not provided"}</p><p>Preferred shifts: {profile.shift_preference?.join(", ") || "Not provided"}</p>{["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(day => { const schedule = profile.availability_schedule?.[day]; return <div key={day} className="flex flex-wrap justify-between gap-2 border-b py-3"><span className="capitalize font-medium">{day}</span><span>{schedule?.start && schedule?.end ? `${schedule.start} – ${schedule.end}` : "No hours provided"}</span></div>; })}</TabsContent>
    <TabsContent value="Photos" className="space-y-4"><h2 className="text-xl font-bold">Officer photos</h2>{record.photoError ? <p role="alert">Photos could not be loaded. Reopen the profile to retry.</p> : !photos.length ? <p>No photos available.</p> : <div className="grid gap-4 sm:grid-cols-2">{photos.map((photo: any) => <figure key={photo.path} className="rounded-lg border p-3">{photo.signedUrl ? <a href={photo.signedUrl} target="_blank" rel="noopener noreferrer"><img src={photo.signedUrl} alt={photoLabels[photo.path.split("/").pop().split(".")[0]] || "Officer photo"} className="h-72 w-full object-contain" /></a> : <p>Photo preview unavailable.</p>}<figcaption className="mt-2 font-medium">{photoLabels[photo.path.split("/").pop().split(".")[0]]}</figcaption></figure>)}</div>}</TabsContent>
    <TabsContent value="Licenses and certificates" className="space-y-4"><h2 className="text-xl font-bold">Licenses and certificates</h2>{record.certificateError ? <p role="alert">Credentials could not be loaded.</p> : !certificates.length ? <p>No credentials provided.</p> : certificates.map((certificate: any) => <article key={certificate.id} className="rounded-lg border p-4 space-y-2"><h3 className="font-semibold">{certificate.name}</h3><p>License number: {certificate.certification_number || certificate.credential_id || "Not provided"}</p><p>Issued: {certificate.issue_date || "Not provided"} · Expires: {certificate.expiry_date || "Not provided"}</p><p>{certificate.issuing_organization}</p></article>)}</TabsContent>
    <TabsContent value="Work history" className="space-y-4"><h2 className="text-xl font-bold">Work history</h2>{record.historyError ? <p role="alert">Work history could not be loaded.</p> : !history.length ? <p>No work history provided.</p> : history.map((job: any) => <article key={job.id} className="rounded-lg border p-4 space-y-2"><h3 className="font-semibold">{job.company_name}</h3><p>{job.position_title}</p><p>{job.start_date || "Start date not provided"} – {job.end_date || "Present"}</p><p className="whitespace-pre-line">{job.job_description}</p></article>)}</TabsContent>
  </Tabs>;
}
