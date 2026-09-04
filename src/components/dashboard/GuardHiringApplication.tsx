import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Cloud, Copy, Download, ExternalLink, FileCheck2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { OfficerPhotos } from "./OfficerPhotos";
import { CertificationsManager, type Certification } from "./CertificationsManager";
import { generateGuardApplicationPDF, type GuardApplicationData } from "@/lib/generateGuardApplicationPDF";

interface Props {
  userId: string;
  officerId: string | null;
  onChanged?: () => void;
  onEnsureProfile?: () => Promise<any>;
}
type Schedule = Record<string, { start: string; end: string }>;
type SharedData = { employmentTypes: string[]; shiftPreferences: string[]; schedule: Schedule };
type WorkItem = Record<string, string>;

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const weekdays = days.slice(0, 5);
const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  const value = `${String(hour).padStart(2, "0")}:${minute}`;
  const label = `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
  return { value, label };
});
const blankJob: WorkItem = { id: "", employer: "", title: "", startDate: "", endDate: "", supervisor: "", phone: "", reason: "" };
const blankReference = { name: "", relationship: "", phone: "", email: "" };
const steps = [
  ["Position", "What role are you looking for?"], ["Personal information", "Tell us how to reach you"],
  ["Eligibility", "Confirm your work credentials"], ["Qualifications", "Share your education and skills"],
  ["Work history", "Add your recent experience (optional)"], ["References", "Add professional references (optional)"],
  ["Availability", "Tell employers when you can work"], ["Photos", "Add your required professional photos"],
  ["License or certification", "Upload at least one front document"], ["Review and signature", "Review forms and certify"],
];
const initialForm: GuardApplicationData = {
  applicantName: "", email: "", phone: "", address: "", city: "", state: "", zip: "",
  companyName: "Kairos Security", companyCity: "Houston", companyState: "Texas", position: "Security Officer", employmentType: "full-time",
  startDate: "", licenseLevels: [], eligibleToWork: "", isAdult: "", driversLicense: "",
  securityLicenseNumber: "", securityLicenseState: "", education: "", skills: "",
  workHistory: [{ ...blankJob }, { ...blankJob }], references: [{ ...blankReference }, { ...blankReference }, { ...blankReference }],
  signature: "", signatureDate: new Date().toISOString().slice(0, 10),
};

const Field = ({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) => <div className="space-y-2"><Label>{label}{required ? " *" : ""}</Label><Input className="h-12 text-base" type={type} value={value} onChange={e => onChange(e.target.value)} /></div>;
const YesNo = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => <div className="space-y-3"><Label>{label} *</Label><RadioGroup value={value} onValueChange={onChange} className="flex gap-8">{["Yes", "No"].map(v => <div key={v} className="flex items-center gap-2"><RadioGroupItem value={v} id={`${label}-${v}`} /><Label htmlFor={`${label}-${v}`}>{v}</Label></div>)}</RadioGroup></div>;

export function GuardHiringApplication({ userId, officerId, onChanged, onEnsureProfile }: Props) {
  const [resolvedOfficerId, setResolvedOfficerId] = useState<string | null>(officerId);
  const [form, setForm] = useState(initialForm);
  const [shared, setShared] = useState<SharedData>({ employmentTypes: [], shiftPreferences: [], schedule: {} });
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [masterId, setMasterId] = useState<string | null>(null);
  const [masterStatus, setMasterStatus] = useState<"draft" | "submitted">("draft");
  const [currentStep, setCurrentStep] = useState(0);
  const [jobs, setJobs] = useState<Array<{ id: string; companyName: string; position: string; city: string; state: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const pendingSaveCount = useRef(0);
  const masterIdRef = useRef<string | null>(null);
  const activeOfficerId = officerId || resolvedOfficerId;

  useEffect(() => {
    if (officerId) setResolvedOfficerId(officerId);
  }, [officerId]);

  useEffect(() => {
    masterIdRef.current = masterId;
  }, [masterId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let loadingOfficerId = officerId;
      if (!loadingOfficerId && onEnsureProfile) {
        const ensuredProfile = await onEnsureProfile();
        if (!mounted) return;
        loadingOfficerId = ensuredProfile?.id || null;
        if (loadingOfficerId) setResolvedOfficerId(loadingOfficerId);
        else setSaveError("We couldn't create the officer record needed to save this application.");
      }
      const appTable = (supabase as any).from("guard_hiring_applications");
      const requests: any[] = [
        supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle(),
        supabase.from("officer_profiles").select("phone,address_street,address_unit,address_city,address_state,address_zip,employment_type,shift_preference,availability_schedule").eq("user_id", userId).maybeSingle(),
        appTable.select("*").eq("user_id", userId).eq("application_type", "master").maybeSingle(),
      ];
      if (loadingOfficerId) requests.push(supabase.from("work_history").select("*").eq("officer_id", loadingOfficerId).order("start_date", { ascending: false }), supabase.from("job_applications").select("id,job_posting:job_postings(title,location,company:company_profiles(company_name))").eq("officer_id", loadingOfficerId));
      const [profileResult, officerResult, masterResult, workResult, jobsResult] = await Promise.all(requests);
      if (!mounted) return;
      const profile = profileResult.data; const officer = officerResult.data; const master = masterResult.data;
      const draft = (master?.application_data || {}) as Partial<GuardApplicationData>;
      const canonicalWork = (workResult?.data || []).map((w: any) => ({ id: w.id, employer: w.company_name || "", title: w.position_title || "", startDate: w.start_date || "", endDate: w.end_date || "", supervisor: w.supervisor_name || "", phone: w.supervisor_phone || w.company_phone || "", reason: w.reason_for_leaving || "" }));
      setForm({
        ...initialForm,
        ...draft,
        applicantName: draft.applicantName || profile?.full_name || "",
        email: draft.email || profile?.email || "",
        phone: draft.phone || officer?.phone || "",
        address: draft.address || officer?.address_street || "",
        city: draft.city || officer?.address_city || "",
        state: draft.state || officer?.address_state || "",
        zip: draft.zip || officer?.address_zip || "",
        workHistory: draft.workHistory?.length ? draft.workHistory : (canonicalWork.length ? canonicalWork : initialForm.workHistory),
      });
      const savedAvailability = (draft as any).availability as SharedData | undefined;
      setShared(savedAvailability || { employmentTypes: officer?.employment_type || [], shiftPreferences: officer?.shift_preference || [], schedule: officer?.availability_schedule || {} });
      setMasterId(master?.id || null); setMasterStatus(master?.status === "submitted" ? "submitted" : "draft"); setCurrentStep(Math.min(Number(master?.current_step || 0), 9));
      setJobs((jobsResult?.data || []).map((item: any) => {
        const [city = "", ...stateParts] = (item.job_posting?.location || "").split(",").map((part: string) => part.trim());
        return { id: item.id, position: item.job_posting?.title || "Security Officer", companyName: item.job_posting?.company?.company_name || "Hiring Company", city, state: stateParts.join(", ") };
      }));
      setLoaded(true);
    })();
    return () => { mounted = false; };
  }, [userId, officerId]);

  const syncShared = async (includeWorkHistory = false) => {
    if (!activeOfficerId) throw new Error("Your officer profile is not ready yet");
    const [profileResult, officerResult] = await Promise.all([
      supabase.from("profiles").update({ full_name: form.applicantName }).eq("id", userId),
      supabase.from("officer_profiles").update({ phone: form.phone, address_street: form.address, address_city: form.city, address_state: form.state, address_zip: form.zip, employment_type: shared.employmentTypes, shift_preference: shared.shiftPreferences, availability_schedule: shared.schedule } as any).eq("id", activeOfficerId),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (officerResult.error) throw officerResult.error;
    if (!includeWorkHistory) return;
    for (const item of form.workHistory.filter(j => j.employer?.trim())) {
      const payload: any = { officer_id: activeOfficerId, company_name: item.employer, position_title: item.title || null, start_date: item.startDate || null, end_date: item.endDate || null, supervisor_name: item.supervisor || null, supervisor_phone: item.phone || null, reason_for_leaving: item.reason || null };
      if (item.id) {
        const { error } = await supabase.from("work_history").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("work_history").insert(payload).select("id").single();
        if (error) throw error;
        if (data?.id) item.id = data.id;
      }
    }
  };

  const saveDraft = (step = currentStep, syncManagementRecords = false): Promise<boolean> => {
    if (!loaded || !activeOfficerId) return Promise.resolve(false);
    pendingSaveCount.current += 1;
    setSaving(true);
    const performSave = async () => {
      try {
        const payload: any = { officer_id: activeOfficerId, user_id: userId, application_type: "master", job_application_id: null, company_name: "General We Find Guards Application", position: form.position, applicant_name: form.applicantName || "Incomplete application", applicant_email: form.email || "pending", status: masterStatus, current_step: step, signature_name: form.signature || null, signature_date: form.signatureDate || null, application_data: { ...form, availability: shared } };
        const savedMasterId = masterIdRef.current;
        const query = savedMasterId ? (supabase as any).from("guard_hiring_applications").update(payload).eq("id", savedMasterId).select("id").single() : (supabase as any).from("guard_hiring_applications").insert(payload).select("id").single();
        const { data, error } = await query;
        if (error) throw error;
        if (data?.id) {
          masterIdRef.current = data.id;
          setMasterId(data.id);
        }
        await syncShared(syncManagementRecords);
        setSaveError(null);
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
        return true;
      } catch (error: any) {
        console.error("Draft save failed", error);
        setSaveError(error.message || "Draft could not be saved");
        return false;
      }
    };
    const queuedSave = saveQueue.current.then(performSave, performSave);
    saveQueue.current = queuedSave;
    return queuedSave.finally(() => {
      pendingSaveCount.current -= 1;
      if (pendingSaveCount.current === 0) setSaving(false);
    });
  };

  useEffect(() => {
    if (!loaded || !activeOfficerId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveDraft(); }, 250);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [form, shared, currentStep, loaded, activeOfficerId]);

  const availabilityComplete = shared.employmentTypes.length > 0 && shared.shiftPreferences.length > 0 && Object.values(shared.schedule).some(v => v.start && v.end);
  const photosComplete = Boolean(photos.headshot && photos["full-body"]);
  const certificationComplete = certifications.some(c => Boolean(c.document_front_url));
  const stepComplete = (step: number) => step === 0 ? Boolean(form.position) : step === 1 ? Boolean(form.applicantName && form.email && form.phone && form.address && form.city && form.state && form.zip) : step === 2 ? Boolean(form.isAdult && form.eligibleToWork) : step === 6 ? availabilityComplete : step === 7 ? photosComplete : step === 8 ? certificationComplete : step === 9 ? Boolean(form.signature && form.signatureDate && acknowledged) : true;
  const complete = useMemo(() => [0, 1, 2, 6, 7, 8, 9].every(stepComplete), [form, shared, photos, certifications, acknowledged]);
  const update = <K extends keyof GuardApplicationData>(key: K, value: GuardApplicationData[K]) => setForm(current => ({ ...current, [key]: value }));
  const updateList = (key: "workHistory" | "references", index: number, field: string, value: string) => setForm(current => ({ ...current, [key]: current[key].map((item, i) => i === index ? { ...item, [field]: value } : item) }));
  const go = async (step: number) => {
    const nextStep = Math.max(0, Math.min(9, step));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const saved = await saveDraft(nextStep, true);
    if (!saved) {
      toast.error("Your progress could not be saved. Please try again before leaving this page.");
      return;
    }
    setCurrentStep(nextStep);
    requestAnimationFrame(() => document.getElementById("guard-application-top")?.scrollIntoView({ behavior: "auto", block: "start" }));
  };
  const next = async () => { if (!stepComplete(currentStep)) { toast.error(currentStep === 7 ? "Upload your headshot and full-body photo" : currentStep === 8 ? "Add a license or certification and upload its front document" : "Complete the required fields before continuing"); return; } await go(currentStep + 1); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!complete || !activeOfficerId) { toast.error("Complete every required onboarding item before submitting"); return; }
    setSubmitting(true);
    try {
      await syncShared();
      const snapshot = { ...form, availability: shared, canonicalPhotoTypes: Object.keys(photos), canonicalCertificationIds: certifications.filter(c => c.document_front_url).map(c => c.id) } as any;
      const base: any = { officer_id: officerId, user_id: userId, company_name: "General We Find Guards Application", position: form.position, applicant_name: form.applicantName, applicant_email: form.email, status: "submitted", current_step: 9, submitted_at: new Date().toISOString(), signature_name: form.signature, signature_date: form.signatureDate, application_data: snapshot };
      const result = masterId ? await (supabase as any).from("guard_hiring_applications").update({ ...base, application_type: "master", job_application_id: null }).eq("id", masterId).select("id").single() : await (supabase as any).from("guard_hiring_applications").insert({ ...base, application_type: "master", job_application_id: null }).select("id").single();
      if (result.error) throw result.error; setMasterId(result.data.id); setMasterStatus("submitted");
      const selectedJob = jobs.find(j => j.companyName === form.companyName && j.position === form.position);
      if (selectedJob) {
        const employerSnapshot = { ...snapshot, companyName: selectedJob.companyName, companyCity: selectedJob.city, companyState: selectedJob.state, position: selectedJob.position };
        const { error: copyError } = await (supabase as any).from("guard_hiring_applications").insert({ ...base, application_type: "employer_copy", source_application_id: result.data.id, job_application_id: selectedJob.id, company_name: selectedJob.companyName, position: selectedJob.position, application_data: employerSnapshot });
        if (copyError && copyError.code !== "23505") throw copyError;
      }
      toast.success("Onboarding application submitted"); onChanged?.(); await generateGuardApplicationPDF(form);
    } catch (error: any) { toast.error(error.message || "Could not submit the application"); }
    finally { setSubmitting(false); }
  };

  const progress = Math.round(((currentStep + 1) / 10) * 100);
  return <form id="guard-application-top" onSubmit={submit} className="mx-auto w-full max-w-6xl scroll-mt-4 pb-24 lg:pb-8">
    <div className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background"><div className="flex items-center gap-3 px-5 py-5 sm:px-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><ShieldCheck className="h-7 w-7" /></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">We Find Guards</p><h1 className="text-xl font-bold sm:text-2xl">Security Officer Application</h1><p className="mt-1 text-sm text-muted-foreground">Your application saves automatically. You can leave and continue later.</p>{saveError && <p className="mt-2 text-sm font-semibold text-destructive">Draft not saved. Please check your connection and try again.</p>}</div><span className={`hidden items-center gap-1 text-xs sm:flex ${saveError ? "text-destructive" : "text-muted-foreground"}`}><Cloud className="h-4 w-4" />{saveError ? "Save failed" : saving ? "Saving…" : savedAt ? `Saved ${savedAt}` : "Autosave on"}</span></div><div className="h-2 bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div>
    <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]"><aside className="hidden lg:block"><nav className="sticky top-4 space-y-1 rounded-2xl border bg-card p-3">{steps.map((s, i) => <button key={s[0]} type="button" onClick={() => go(i)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === currentStep ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === currentStep ? "bg-white/20" : stepComplete(i) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{stepComplete(i) && i !== currentStep ? <Check className="h-4 w-4" /> : i + 1}</span><span className="min-w-0"><span className="block text-sm font-semibold">{s[0]}</span><span className={`block truncate text-xs ${i === currentStep ? "text-white/75" : "text-muted-foreground"}`}>{s[1]}</span></span></button>)}</nav></aside>
      <main className="min-w-0"><div className="mb-4 flex justify-between lg:hidden"><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">Step {currentStep + 1} of 10</span><span className="text-sm text-muted-foreground">{progress}% complete</span></div><Card className="rounded-2xl shadow-sm"><CardHeader className="border-b px-5 py-6 sm:px-8"><CardTitle className="text-2xl sm:text-3xl">{steps[currentStep][0]}</CardTitle><CardDescription className="text-base">{steps[currentStep][1]}</CardDescription></CardHeader><CardContent className="px-5 py-7 sm:px-8 sm:py-9">
        {currentStep === 0 && <div className="space-y-6"><div className="rounded-2xl border border-primary/20 bg-primary/5 p-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Current hiring destination</p><h3 className="mt-2 text-xl font-bold">{form.companyName}</h3><p className="mt-1 text-sm text-muted-foreground">{[form.companyCity, form.companyState].filter(Boolean).join(", ")}</p></div><div className="grid gap-5 md:grid-cols-2"><div className="space-y-2 md:col-span-2"><Label>Company and job location *</Label><select className="h-12 w-full rounded-lg border bg-background px-4" value={`${form.companyName}|${form.position}|${form.companyCity}|${form.companyState}`} onChange={e => { const [companyName, position, companyCity, companyState] = e.target.value.split("|"); setForm(c => ({ ...c, companyName, position, companyCity, companyState })); }}><option value="Kairos Security|Security Officer|Houston|Texas">Kairos Security — Houston, Texas</option>{jobs.filter(j => !(j.companyName === "Kairos Security" && j.city === "Houston")).map(j => <option key={j.id} value={`${j.companyName}|${j.position}|${j.city}|${j.state}`}>{j.companyName} — {[j.city, j.state].filter(Boolean).join(", ")} — {j.position}</option>)}</select><p className="text-sm text-muted-foreground">Additional companies will appear here after they are added as hiring companies and post a job.</p></div><Field label="Position applied for" value={form.position} onChange={v => update("position", v)} required /><Field label="Available start date" value={form.startDate} onChange={v => update("startDate", v)} type="date" /></div></div>}
        {currentStep === 1 && <div className="space-y-5"><p className="rounded-xl bg-primary/5 p-4 text-sm text-muted-foreground">Information entered here is the same information shown in your Profile tab.</p><div className="grid gap-5 md:grid-cols-2"><Field label="Full legal name" value={form.applicantName} onChange={v => update("applicantName", v)} required /><Field label="Email" value={form.email} onChange={v => update("email", v)} type="email" required /><Field label="Phone" value={form.phone} onChange={v => update("phone", v)} type="tel" required /></div><AddressAutocomplete value={{ street: form.address, unit: "", city: form.city, state: form.state, zip: form.zip }} onChange={a => setForm(c => ({ ...c, address: a.street, city: a.city, state: a.state, zip: a.zip }))} /></div>}
        {currentStep === 2 && <div className="grid gap-7 md:grid-cols-2"><YesNo label="Are you 18 years of age or older?" value={form.isAdult} onChange={v => update("isAdult", v)} /><YesNo label="Can you provide proof that you may work in the U.S.?" value={form.eligibleToWork} onChange={v => update("eligibleToWork", v)} /><YesNo label="Do you have a valid driver's license?" value={form.driversLicense} onChange={v => update("driversLicense", v)} /><Field label="Security license number" value={form.securityLicenseNumber} onChange={v => update("securityLicenseNumber", v)} /><Field label="Security license state" value={form.securityLicenseState} onChange={v => update("securityLicenseState", v)} /></div>}
        {currentStep === 3 && <div className="space-y-6"><div className="space-y-2"><Label>Highest education, school, diploma, or degree</Label><Textarea value={form.education} onChange={e => update("education", e.target.value)} /></div><div className="space-y-2"><Label>Security training, skills, and equipment</Label><Textarea rows={5} value={form.skills} onChange={e => update("skills", e.target.value)} /></div></div>}
        {currentStep === 4 && <div className="space-y-5"><p className="text-sm text-muted-foreground">Optional. Entries save to Work History and can be edited there later.</p>{form.workHistory.map((j, i) => <div key={i} className="grid gap-4 rounded-xl border p-4 md:grid-cols-2"><p className="font-semibold text-primary md:col-span-2">Employer {i + 1}</p><Field label="Employer" value={j.employer || ""} onChange={v => updateList("workHistory", i, "employer", v)} /><Field label="Job title" value={j.title || ""} onChange={v => updateList("workHistory", i, "title", v)} /><Field label="Start date" type="date" value={j.startDate || ""} onChange={v => updateList("workHistory", i, "startDate", v)} /><Field label="End date" type="date" value={j.endDate || ""} onChange={v => updateList("workHistory", i, "endDate", v)} /><Field label="Supervisor" value={j.supervisor || ""} onChange={v => updateList("workHistory", i, "supervisor", v)} /><Field label="Supervisor phone" value={j.phone || ""} onChange={v => updateList("workHistory", i, "phone", v)} /></div>)}</div>}
        {currentStep === 5 && <div className="space-y-5"><p className="text-sm text-muted-foreground">Optional professional references (not relatives).</p>{form.references.map((r, i) => <div key={i} className="grid gap-4 rounded-xl border p-4 md:grid-cols-2"><p className="font-semibold text-primary md:col-span-2">Reference {i + 1}</p><Field label="Name" value={r.name} onChange={v => updateList("references", i, "name", v)} /><Field label="Relationship" value={r.relationship} onChange={v => updateList("references", i, "relationship", v)} /><Field label="Phone" value={r.phone} onChange={v => updateList("references", i, "phone", v)} /><Field label="Email" type="email" value={r.email} onChange={v => updateList("references", i, "email", v)} /></div>)}</div>}
        {currentStep === 6 && <Availability shared={shared} setShared={setShared} />}
        {currentStep === 7 && <OfficerPhotos userId={userId} embedded onChanged={setPhotos} />}
        {currentStep === 8 && <CertificationsManager officerId={activeOfficerId || ""} userId={userId} onEnsureProfile={onEnsureProfile} onChanged={setCertifications} />}
        {currentStep === 9 && <div className="space-y-8"><section><h3 className="mb-2 text-lg font-semibold">Official government forms</h3><p className="mb-4 text-sm text-muted-foreground">Open the official fillable PDF, complete it, then download or print it.</p><div className="grid gap-4 md:grid-cols-3"><GovernmentForm title="Form I-9" href="https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf" /><GovernmentForm title="Form W-4" href="https://www.irs.gov/pub/irs-pdf/fw4.pdf" /><GovernmentForm title="Form W-9" href="https://www.irs.gov/pub/irs-pdf/fw9.pdf" /></div></section><section className="space-y-4 border-t pt-7"><h3 className="text-lg font-semibold">Certification and electronic signature</h3><p className="text-sm text-muted-foreground">I certify that this application is true and complete and authorize verification of the information provided.</p><div className="flex items-start gap-2"><Checkbox id="certify" checked={acknowledged} onCheckedChange={v => setAcknowledged(Boolean(v))} /><Label htmlFor="certify">I have read and agree to the certification above. *</Label></div><div className="grid gap-4 md:grid-cols-2"><Field label="Full legal name as signature" value={form.signature} onChange={v => update("signature", v)} required /><Field label="Date signed" type="date" value={form.signatureDate} onChange={v => update("signatureDate", v)} required /></div><div className="rounded-xl bg-muted/40 p-4 text-sm"><p className="font-semibold">Required onboarding check</p><p>{photosComplete ? "✓" : "○"} Headshot and full-body photo &nbsp; {availabilityComplete ? "✓" : "○"} Availability &nbsp; {certificationComplete ? "✓" : "○"} Certification front</p></div></section></div>}
      </CardContent></Card><Actions current={currentStep} go={go} next={next} submit={submitting} complete={complete} form={form} /></main></div>
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t bg-background/95 p-3 shadow-xl backdrop-blur lg:hidden"><Button type="button" variant="outline" size="lg" onClick={() => go(currentStep - 1)} disabled={!currentStep}><ArrowLeft className="h-5 w-5" /></Button>{currentStep < 9 ? <Button type="button" size="lg" className="flex-1" onClick={next}>Continue<ArrowRight className="ml-2 h-5 w-5" /></Button> : <Button type="submit" size="lg" className="flex-1" disabled={submitting || !complete}><FileCheck2 className="mr-2 h-5 w-5" />{submitting ? "Submitting…" : "Submit application"}</Button>}</div>
  </form>;
}

function Availability({ shared, setShared }: { shared: SharedData; setShared: React.Dispatch<React.SetStateAction<SharedData>> }) {
  const toggle = (key: "employmentTypes" | "shiftPreferences", value: string, checked: boolean) => setShared(c => ({ ...c, [key]: checked ? Array.from(new Set([...c[key], value])) : c[key].filter(v => v !== value) }));
  const updateTime = (day: string, field: "start" | "end", value: string) => setShared(current => ({
    ...current,
    schedule: {
      ...current.schedule,
      [day]: {
        start: field === "start" ? value : current.schedule[day]?.start || "",
        end: field === "end" ? value : current.schedule[day]?.end || "",
      },
    },
  }));
  const copyDay = (sourceDay: string, targetDays: string[]) => setShared(current => {
    const source = current.schedule[sourceDay];
    if (!source?.start || !source?.end) return current;
    const schedule = { ...current.schedule };
    targetDays.forEach(day => { schedule[day] = { ...source }; });
    return { ...current, schedule };
  });

  return <div className="space-y-7">
    <section className="space-y-3"><Label className="text-base">Employment type *</Label><div className="flex flex-wrap gap-5">{[["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract"]].map(([v,l]) => <label key={v} className="flex items-center gap-2 rounded-lg border px-4 py-3"><Checkbox checked={shared.employmentTypes.includes(v)} onCheckedChange={c => toggle("employmentTypes", v, Boolean(c))} />{l}</label>)}</div></section>
    <section className="space-y-3"><Label className="text-base">Preferred shift *</Label><div className="flex flex-wrap gap-5">{[["first_shift", "Day"], ["second_shift", "Evening"], ["third_shift", "Night"], ["weekend", "Weekend"]].map(([v,l]) => <label key={v} className="flex items-center gap-2 rounded-lg border px-4 py-3"><Checkbox checked={shared.shiftPreferences.includes(v)} onCheckedChange={c => toggle("shiftPreferences", v, Boolean(c))} />{l}</label>)}</div></section>
    <section className="space-y-3">
      <div><Label className="text-base">Weekly schedule *</Label><p className="mt-1 text-sm text-muted-foreground">Choose a start and end time, then copy that schedule to other days if needed.</p></div>
      {days.map(day => {
        const schedule = shared.schedule[day];
        const canCopy = Boolean(schedule?.start && schedule?.end);
        return <div key={day} className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{day}</span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!canCopy} onClick={() => copyDay(day, weekdays)}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy to weekdays</Button>
              <Button type="button" variant="outline" size="sm" disabled={!canCopy} onClick={() => copyDay(day, days)}><Copy className="mr-1.5 h-3.5 w-3.5" />Copy to every day</Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TimeSelect label={`${day} start time`} value={schedule?.start || ""} placeholder="Select start time" onChange={value => updateTime(day, "start", value)} />
            <TimeSelect label={`${day} end time`} value={schedule?.end || ""} placeholder="Select end time" onChange={value => updateTime(day, "end", value)} />
          </div>
        </div>;
      })}
    </section>
  </div>;
}

function TimeSelect({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  const options = value && !timeOptions.some(option => option.value === value)
    ? [{ value, label: value }, ...timeOptions]
    : timeOptions;
  return <div className="space-y-2"><Label className="text-sm">{label}</Label><select aria-label={label} className="h-12 w-full rounded-lg border bg-background px-3 text-base" value={value} onChange={event => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}
function Actions({ current, go, next, submit, complete, form }: any) { return <div className="mt-5 hidden items-center justify-between lg:flex"><Button type="button" variant="outline" onClick={() => go(current - 1)} disabled={!current}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>{current < 9 ? <Button type="button" onClick={next}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button> : <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => generateGuardApplicationPDF(form)}><Download className="mr-2 h-4 w-4" />Preview PDF</Button><Button type="submit" disabled={submit || !complete}><FileCheck2 className="mr-2 h-4 w-4" />{submit ? "Submitting…" : "Submit application"}</Button></div>}</div>; }
function GovernmentForm({ title, href }: { title: string; href: string }) { return <div className="rounded-xl border p-4"><FileCheck2 className="mb-3 h-6 w-6 text-primary" /><h3 className="font-semibold">{title}</h3><Button asChild variant="outline" className="mt-4 w-full"><a href={href} target="_blank" rel="noreferrer">Open fillable PDF<ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>; }
