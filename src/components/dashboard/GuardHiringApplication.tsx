import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Cloud, Copy, Download, FileCheck2, PlayCircle, Plus, ShieldCheck, X } from "lucide-react";
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
import { DatePicker } from "@/components/ui/date-picker";
import { useSearchParams } from "@/lib/router-compat";
import { SignaturePad } from "./SignaturePad";
import { formatUsPhone } from "@/lib/phone";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  userId: string;
  officerId: string | null;
  onChanged?: () => void;
  onEnsureProfile?: () => Promise<any>;
}
type Schedule = Record<string, { start: string; end: string }>;
type SharedData = { employmentTypes: string[]; shiftPreferences: string[]; schedule: Schedule };
type WorkItem = Record<string, string>;
type HiringDestination = { id: string; companyId: string; companyName: string; position: string; city: string; state: string };

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
const states = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];
const skillOptions = ["Level II", "Level III", "Level IV", "Pepper spray", "Baton", "Handcuffs", "Firearms", "First aid / CPR", "De-escalation", "Report writing"];
const steps = [
  ["Position", "What role are you looking for?"], ["Personal information", "Tell us how to reach you"],
  ["Eligibility", "Confirm your work credentials"], ["Qualifications", "Share your education and skills"],
  ["Work history", "Add your recent experience (optional)"], ["References", "Add professional references (optional)"],
  ["Availability", "Tell employers when you can work"], ["Photos", "Add optional professional photos"],
  ["License or certification", "Add credentials when applicable"], ["Review and signature", "Review and certify"],
];
const initialForm: GuardApplicationData = {
  applicantName: "", email: "", phone: "", address: "", city: "", state: "", zip: "",
  companyName: "Kairos Security", companyCity: "Houston", companyState: "Texas", position: "Security Officer", employmentType: "full-time",
  startDate: "", licenseLevels: [], eligibleToWork: "", isAdult: "", driversLicense: "",
  securityLicenseNumber: "", securityLicenseState: "", education: "", skills: "",
  workHistory: [{ ...blankJob }, { ...blankJob }], references: [{ ...blankReference }, { ...blankReference }, { ...blankReference }],
  signature: "", signatureImage: "", signatureDate: new Date().toISOString().slice(0, 10),
};

const parseApplicationStep = (value: string | null) => {
  const step = Number(value);
  return Number.isInteger(step) && step >= 1 && step <= 10 ? step - 1 : null;
};

const initialApplicationStep = (userId: string, urlStep: string | null) => {
  const fromUrl = parseApplicationStep(urlStep);
  if (fromUrl !== null) return fromUrl;
  if (typeof window === "undefined") return 0;
  return parseApplicationStep(window.localStorage.getItem(`guard-application-step:${userId}`)) ?? 0;
};

const initialPhotoCompletion = (userId: string) => typeof window !== "undefined" && window.localStorage.getItem(`guard-application-photos-complete:${userId}`) === "true";
const initialCertificationCompletion = (userId: string) => typeof window !== "undefined" && window.localStorage.getItem(`guard-application-certification-complete:${userId}`) === "true";

const Field = ({ label, value, onChange, type = "text", required = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) => {
  const id = `application-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (type === "date") {
    return <DatePicker id={id} label={label} value={value} onChange={onChange} required={required} />;
  }
  return <div className="space-y-2"><Label htmlFor={id}>{label}{required ? " *" : ""}</Label><Input id={id} className="h-12 text-base" type={type} inputMode={type === "tel" ? "numeric" : undefined} placeholder={type === "tel" ? "123-456-7890" : undefined} value={value} onChange={e => onChange(type === "tel" ? formatUsPhone(e.target.value) : e.target.value)} /></div>;
};
const YesNo = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => <div className="space-y-3"><Label>{label} *</Label><RadioGroup value={value} onValueChange={onChange} className="flex gap-8">{["Yes", "No"].map(v => <div key={v} className="flex items-center gap-2"><RadioGroupItem value={v} id={`${label}-${v}`} /><Label htmlFor={`${label}-${v}`}>{v}</Label></div>)}</RadioGroup></div>;

export function GuardHiringApplication({ userId, officerId, onChanged, onEnsureProfile }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [resolvedOfficerId, setResolvedOfficerId] = useState<string | null>(officerId);
  const [form, setForm] = useState(initialForm);
  const [shared, setShared] = useState<SharedData>({ employmentTypes: [], shiftPreferences: [], schedule: {} });
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [photosSaved, setPhotosSaved] = useState(() => initialPhotoCompletion(userId));
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [certificationSaved, setCertificationSaved] = useState(() => initialCertificationCompletion(userId));
  const [masterId, setMasterId] = useState<string | null>(null);
  const [masterStatus, setMasterStatus] = useState<"draft" | "submitted">("draft");
  const [currentStep, setCurrentStep] = useState(() => initialApplicationStep(userId, searchParams.get("applicationStep")));
  const [jobs, setJobs] = useState<HiringDestination[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [editingSubmitted, setEditingSubmitted] = useState(false);
  const [resumePath, setResumePath] = useState("");
  const [uploadingResume, setUploadingResume] = useState(false);
  const [applicationStarted, setApplicationStarted] = useState(false);
  const [visitedSteps, setVisitedSteps] = useState<number[]>([]);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [showSubmissionConfirmation, setShowSubmissionConfirmation] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const pendingSaveCount = useRef(0);
  const masterIdRef = useRef<string | null>(null);
  const visitedStepsRef = useRef<number[]>([]);
  const completedStepsRef = useRef<number[]>([]);
  const savePendingLicensesRef = useRef<(() => Promise<boolean>) | null>(null);
  const activeOfficerId = officerId || resolvedOfficerId;

  useEffect(() => {
    if (officerId) setResolvedOfficerId(officerId);
  }, [officerId]);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      supabase.storage.from("officer-photos").list(userId, { limit: 100 }),
      activeOfficerId ? (supabase as any).rpc("get_my_certifications") : Promise.resolve({ data: [], error: null }),
    ]).then(([photoResult, certificationResult]) => {
      if (!mounted) return;
      if (!photoResult.error) {
        const photoTypes = (photoResult.data || []).map((file) => file.name.split(".")[0]);
        const photoComplete = photoTypes.includes("headshot") && photoTypes.includes("full-body");
        setPhotos(Object.fromEntries(photoTypes.map((type) => [type, "stored"])));
        setPhotosSaved(photoComplete);
        window.localStorage.setItem(`guard-application-photos-complete:${userId}`, String(photoComplete));
      }
      if (!certificationResult.error) {
        const storedCertifications = (certificationResult.data || []) as Certification[];
        const certificationComplete = storedCertifications.some((certification) => Boolean(certification.document_front_url));
        setCertifications(storedCertifications);
        setCertificationSaved(certificationComplete);
        window.localStorage.setItem(`guard-application-certification-complete:${userId}`, String(certificationComplete));
      }
    }).catch((error) => console.error("Application completion status could not be loaded", error));
    return () => { mounted = false; };
  }, [userId, activeOfficerId]);

  useEffect(() => {
    masterIdRef.current = masterId;
  }, [masterId]);

  useEffect(() => {
    visitedStepsRef.current = visitedSteps;
  }, [visitedSteps]);

  useEffect(() => {
    completedStepsRef.current = completedSteps;
  }, [completedSteps]);

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
      // Only wait for the four records required to paint the saved draft.
      // Work history and hiring destinations load after the form is visible.
      const requests: any[] = [
        supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle(),
        supabase.from("officer_profiles").select("phone,address_street,address_unit,address_city,address_state,address_zip,employment_type,shift_preference,availability_schedule,resume_url").eq("user_id", userId).maybeSingle(),
        appTable.select("id,status,current_step,application_data,created_at").eq("user_id", userId).eq("application_type", "master").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.auth.getSession(),
      ];
      const [profileResult, officerResult, masterResult, authResult] = await Promise.all(requests);
      if (!mounted) return;
      const profile = profileResult.data; const officer = officerResult.data; const master = masterResult.data;
      const draft = (master?.application_data || {}) as Partial<GuardApplicationData>;
      const savedPhotoCompletion = Boolean((draft as any).photoRequirementsComplete);
      if (savedPhotoCompletion) {
        setPhotosSaved(true);
        window.localStorage.setItem(`guard-application-photos-complete:${userId}`, "true");
      }
      const savedCertificationCompletion = Boolean((draft as any).certificationRequirementsComplete);
      if (savedCertificationCompletion) {
        setCertificationSaved(true);
        window.localStorage.setItem(`guard-application-certification-complete:${userId}`, "true");
      }
      const capturedLead = (() => {
        const leadId = searchParams.get("lead");
        if (!leadId) return null;
        try { return JSON.parse(sessionStorage.getItem(`candidate-lead:${leadId}`) || "null"); }
        catch { return null; }
      })();
      setForm({
        ...initialForm,
        ...draft,
        applicantName: draft.applicantName || profile?.full_name || "",
        email: draft.email || profile?.email || "",
        phone: formatUsPhone(draft.phone || officer?.phone || authResult?.data?.session?.user?.user_metadata?.phone || capturedLead?.phone || ""),
        address: draft.address || officer?.address_street || "",
        city: draft.city || officer?.address_city || "",
        state: draft.state || officer?.address_state || "",
        zip: draft.zip || officer?.address_zip || "",
        workHistory: draft.workHistory?.length ? draft.workHistory : initialForm.workHistory,
      });
      setResumePath((draft as any).resumePath || officer?.resume_url || "");
      const savedAvailability = (draft as any).availability as SharedData | undefined;
      setShared(savedAvailability || { employmentTypes: officer?.employment_type || [], shiftPreferences: officer?.shift_preference || [], schedule: officer?.availability_schedule || {} });
      const savedStep = Math.min(Number(master?.current_step || 0), 9);
      const urlStep = parseApplicationStep(searchParams.get("applicationStep"));
      const restoredStep = urlStep ?? savedStep;
      masterIdRef.current = master?.id || null;
      setMasterId(master?.id || null); setMasterStatus(master?.status === "submitted" ? "submitted" : "draft"); setCurrentStep(restoredStep);
      const savedVisitedSteps = Array.isArray((draft as any).visitedSteps)
        ? (draft as any).visitedSteps.filter((step: unknown) => Number.isInteger(step) && Number(step) >= 0 && Number(step) <= 9)
        : master ? Array.from({ length: savedStep + 1 }, (_, index) => index) : [];
      visitedStepsRef.current = savedVisitedSteps;
      setVisitedSteps(savedVisitedSteps);
      const savedCompletedSteps = Array.isArray((draft as any).completedSteps)
        ? (draft as any).completedSteps.filter((step: unknown) => Number.isInteger(step) && Number(step) >= 0 && Number(step) <= 9)
        : [];
      completedStepsRef.current = savedCompletedSteps;
      setCompletedSteps(savedCompletedSteps);
      setApplicationStarted(Boolean(master));
      window.localStorage.setItem(`guard-application-step:${userId}`, String(restoredStep + 1));
      const referredJobId = searchParams.get("job") || "";
      const savedJobId = referredJobId || (draft as any).jobPostingId || "";
      setSelectedJobId(savedJobId);
      setLoaded(true);

      // Secondary records hydrate the already-visible application.
      void Promise.all([
        loadingOfficerId && !draft.workHistory?.length
          ? supabase.from("work_history").select("*").eq("officer_id", loadingOfficerId).order("start_date", { ascending: false })
          : Promise.resolve({ data: [] }),
        (supabase as any).rpc("list_active_hiring_destinations"),
      ]).then(([workResult, jobsResult]) => {
        if (!mounted) return;
        const canonicalWork = (workResult?.data || []).map((w: any) => ({ id: w.id, employer: w.company_name || "", title: w.position_title || "", startDate: w.start_date || "", endDate: w.end_date || "", supervisor: w.supervisor_name || "", phone: w.supervisor_phone || w.company_phone || "", reason: w.reason_for_leaving || "" }));
        if (canonicalWork.length) setForm((current) => ({ ...current, workHistory: current.workHistory.some((item) => item.employer?.trim()) ? current.workHistory : canonicalWork }));
        const destinations: HiringDestination[] = (jobsResult?.data || []).map((item: any) => ({ id: item.id, companyId: item.company_id, companyName: item.company_name, position: item.position, city: item.city || "", state: item.state || "" }));
        const matchingDestination = destinations.find((item) => item.id === savedJobId) || destinations.find((item) =>
          item.companyName.trim().toLowerCase() === (draft.companyName || initialForm.companyName).trim().toLowerCase()
          && item.position.trim().toLowerCase() === (draft.position || initialForm.position).trim().toLowerCase()
          && item.city.trim().toLowerCase() === (draft.companyCity || initialForm.companyCity).trim().toLowerCase()
        );
        const activeDestination = matchingDestination || (destinations.length === 1 ? destinations[0] : undefined);
        setJobs(destinations);
        if (activeDestination) {
          setSelectedJobId(activeDestination.id);
          setForm((current) => ({ ...current, companyName: activeDestination.companyName, position: activeDestination.position, companyCity: activeDestination.city, companyState: activeDestination.state }));
        }
      }).catch((error) => console.warn("Secondary application data is still loading", error));
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
        const payload: any = { officer_id: activeOfficerId, user_id: userId, application_type: "master", job_application_id: null, company_name: "General We Find Guards Application", position: form.position, applicant_name: form.applicantName || "Incomplete application", applicant_email: form.email || "pending", status: masterStatus, current_step: step, signature_name: form.signature || null, signature_date: form.signatureDate || null, application_data: { ...form, resumePath, jobPostingId: selectedJobId, availability: shared, visitedSteps: visitedStepsRef.current, completedSteps: completedStepsRef.current, canonicalPhotoTypes: Object.keys(photos), photoRequirementsComplete: photosSaved, canonicalCertificationIds: certifications.filter((certification) => certification.document_front_url).map((certification) => certification.id), certificationRequirementsComplete: certificationSaved } };
        const savedMasterId = masterIdRef.current;
        const nextMasterId = savedMasterId || crypto.randomUUID();
        const { error } = savedMasterId
          ? await (supabase as any).from("guard_hiring_applications").update(payload).eq("id", savedMasterId)
          : await (supabase as any).from("guard_hiring_applications").insert({ id: nextMasterId, ...payload });
        if (error) throw error;
        if (!savedMasterId) {
          masterIdRef.current = nextMasterId;
          setMasterId(nextMasterId);
        }
        setSaveError(null);
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
        // The master application is the durable source for an in-progress draft.
        // Keep the convenience sync to the management tabs best-effort so an
        // unrelated profile or work-history error cannot trap the applicant on
        // the current step after their draft has already been saved.
        if (syncManagementRecords) {
          try {
            await syncShared(true);
          } catch (syncError) {
            console.warn("Draft saved, but management record sync will be retried", syncError);
          }
        }
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
    if (!loaded || !activeOfficerId || !applicationStarted) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Avoid writing the entire JSON application after nearly every keystroke.
    // Continue/Back still queue an immediate durable save; this timer is only
    // a quiet-period safety net while the applicant remains on one step.
    saveTimer.current = setTimeout(() => { void saveDraft(); }, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [form, shared, photos, photosSaved, certifications, certificationSaved, resumePath, currentStep, loaded, activeOfficerId, selectedJobId, applicationStarted, visitedSteps, completedSteps]);

  const availabilityComplete = shared.employmentTypes.length > 0 && shared.shiftPreferences.length > 0 && Object.values(shared.schedule).some(v => v.start && v.end);
  const photosComplete = photosSaved;
  const certificationComplete = certificationSaved;
  const stepRequirementsMet = (step: number) => step === 0
    ? Boolean(selectedJobId && form.position)
    : step === 1
      ? Boolean(form.applicantName && form.email && form.phone.replace(/\D/g, "").length === 10 && form.address && form.city && form.state && form.zip)
      : step === 2
        ? Boolean(form.isAdult && form.eligibleToWork && form.driversLicense)
        : step === 3
          ? Boolean(form.education.trim() || form.skills.trim())
          : step === 4
            ? form.workHistory.some((item) => Boolean(item.employer?.trim() || item.title?.trim()))
            : step === 5
              ? form.references.some((item) => Boolean(item.name?.trim() || item.phone?.trim() || item.email?.trim()))
              : step === 6
                ? availabilityComplete
                : step === 7
                  ? photosComplete
                  : step === 8
                    ? certificationComplete
                    : Boolean(form.signature && form.signatureImage && form.signatureDate && acknowledged);
  const requiredSteps = [0, 1, 2, 3, 6, 9];
  const stepStatus = (step: number): "not_started" | "in_progress" | "completed" => {
    if (masterStatus === "submitted" || (completedSteps.includes(step) && stepRequirementsMet(step))) return "completed";
    if (visitedSteps.includes(step)) return "in_progress";
    return "not_started";
  };
  const complete = useMemo(() => requiredSteps.every(stepRequirementsMet), [form, shared, acknowledged, selectedJobId, photosComplete, certificationComplete]);
  const requiredStepLabels: Record<number, string> = {
    0: "company and position",
    1: "personal information",
    2: "eligibility questions",
    3: "qualifications",
    6: "availability",
    9: "review, consent, and signature",
  };
  const missingRequiredSteps = requiredSteps.filter((step) => !stepRequirementsMet(step));
  const signatureChecklist = [
    { label: "Consent checkbox", complete: acknowledged },
    { label: "Printed legal name", complete: Boolean(form.signature.trim()) },
    { label: "Signature", complete: Boolean(form.signatureImage) },
    { label: "Date signed", complete: Boolean(form.signatureDate) },
  ];
  const update = <K extends keyof GuardApplicationData>(key: K, value: GuardApplicationData[K]) => setForm(current => ({ ...current, [key]: value }));
  const updatePhotoCompletion = (complete: boolean) => {
    setPhotosSaved(complete);
    window.localStorage.setItem(`guard-application-photos-complete:${userId}`, String(complete));
  };
  const updateCertifications = (items: Certification[]) => {
    const complete = items.some((certification) => Boolean(certification.document_front_url));
    setCertifications(items);
    setCertificationSaved(complete);
    window.localStorage.setItem(`guard-application-certification-complete:${userId}`, String(complete));
  };
  const updateList = (key: "workHistory" | "references", index: number, field: string, value: string) => setForm(current => ({ ...current, [key]: current[key].map((item, i) => i === index ? { ...item, [field]: value } : item) }));
  const uploadResume = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeOfficerId) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Resume must be 10 MB or smaller"); return; }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "doc", "docx"].includes(extension)) { toast.error("Upload a PDF, DOC, or DOCX resume"); return; }
    setUploadingResume(true);
    try {
      const path = `${userId}/resume.${extension}`;
      if (resumePath && resumePath !== path) await supabase.storage.from("resumes").remove([resumePath]);
      const { error: uploadError } = await supabase.storage.from("resumes").upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase.from("officer_profiles").update({ resume_url: path } as any).eq("id", activeOfficerId);
      if (updateError) throw updateError;
      setResumePath(path);
      toast.success("Resume uploaded");
    } catch (error: any) { toast.error(error.message || "Resume could not be uploaded"); }
    finally { setUploadingResume(false); event.target.value = ""; }
  };
  const go = async (step: number) => {
    const nextStep = Math.max(0, Math.min(9, step));
    const nextVisited = Array.from(new Set([...visitedStepsRef.current, currentStep, nextStep])).sort((a, b) => a - b);
    visitedStepsRef.current = nextVisited;
    setVisitedSteps(nextVisited);
    const nextCompleted = stepRequirementsMet(currentStep)
      ? Array.from(new Set([...completedStepsRef.current, currentStep])).sort((a, b) => a - b)
      : completedStepsRef.current.filter((completedStep) => completedStep !== currentStep);
    completedStepsRef.current = nextCompleted;
    setCompletedSteps(nextCompleted);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // Navigation must never be held hostage by a slow autosave. Move the user
    // immediately, then let the durable draft queue finish in the background.
    setCurrentStep(nextStep);
    window.localStorage.setItem(`guard-application-step:${userId}`, String(nextStep + 1));
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("applicationStep", String(nextStep + 1));
    setSearchParams(nextParams, { replace: true });
    requestAnimationFrame(() => document.getElementById("guard-application-top")?.scrollIntoView({ behavior: "auto", block: "start" }));
    // The application JSON is the durable in-progress record. Canonical
    // profile/work-history tables are synchronized once at submission instead
    // of being rewritten on every Back or Continue action.
    void saveDraft(nextStep);
  };
  const next = async () => {
    if (currentStep === 8 && savePendingLicensesRef.current) {
      const licensesSaved = await savePendingLicensesRef.current();
      if (!licensesSaved) return;
    }
    // Photos and credentials are recommended, but they are not required to
    // submit a hiring application. Do not trap applicants on those screens
    // when they choose to add the documents later from their profile.
    if (requiredSteps.includes(currentStep) && !stepRequirementsMet(currentStep)) {
      toast.error("Complete the required fields before continuing");
      return;
    }
    await go(currentStep + 1);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeOfficerId) { toast.error("Your officer profile is not ready yet. Refresh the page and try again."); return; }
    if (!complete) {
      const firstMissingStep = missingRequiredSteps[0];
      const missingLabel = requiredStepLabels[firstMissingStep] || "required application information";
      toast.error(`Still needed: ${missingLabel}. We are taking you to that section.`);
      if (firstMissingStep !== undefined && firstMissingStep !== currentStep) await go(firstMissingStep);
      return;
    }
    setSubmitting(true);
    try {
      const selectedJob = jobs.find(j => j.id === selectedJobId);
      if (!selectedJob) throw new Error("Select an active company position before submitting");
      const snapshot = { ...form, resumePath, jobPostingId: selectedJob.id, availability: shared, visitedSteps: Array.from({ length: 10 }, (_, index) => index), completedSteps: Array.from({ length: 10 }, (_, index) => index).filter(stepRequirementsMet), photosComplete, certificationComplete, canonicalPhotoTypes: Object.keys(photos), photoRequirementsComplete: photosComplete, canonicalCertificationIds: certifications.filter(c => c.document_front_url).map(c => c.id), certificationRequirementsComplete: certificationComplete } as any;
      const employerSnapshot = { ...snapshot, companyName: selectedJob.companyName, companyCity: selectedJob.city, companyState: selectedJob.state, position: selectedJob.position };
      const submission = await (supabase as any).rpc("submit_my_hiring_application", {
        _master_application_id: masterId,
        _officer_id: activeOfficerId,
        _job_posting_id: selectedJob.id,
        _position: form.position,
        _applicant_name: form.applicantName,
        _applicant_email: form.email,
        _signature_name: form.signature,
        _signature_date: form.signatureDate,
        _application_data: employerSnapshot,
      });
      if (submission.error || !submission.data?.[0]) throw submission.error || new Error("Could not submit the application");
      const savedSubmission = submission.data[0];
      setMasterId(savedSubmission.master_application_id);
      setMasterStatus("submitted");
      setEditingSubmitted(false);
      setShowSubmissionConfirmation(true);
      toast.success(editingSubmitted ? "Application resubmitted" : "Hiring application submitted");
      onChanged?.();

      // The signed application and employer copy are already committed. These
      // secondary synchronization and attachment tasks must never keep the
      // applicant on a permanent Submitting screen.
      void Promise.allSettled([
        syncShared(true),
        supabase.functions.invoke("archive-application-evidence", {
          body: { hiring_application_id: savedSubmission.employer_application_id, archive_kind: "submission" },
        }),
      ]).then((results) => {
        const archiveResult = results[1];
        if (archiveResult.status === "fulfilled") {
          const response = archiveResult.value;
          const archiveComplete = !response.error && response.data?.snapshot_status === "complete";
          if (archiveComplete) {
            setForm(current => ({ ...current, attachmentManifest: response.data?.manifest || [] }));
          } else {
            console.warn("Application submitted; optional attachment archiving will retry later", response.error || response.data);
          }
        } else {
          console.warn("Application submitted; optional attachment archiving will retry later", archiveResult.reason);
        }
      });
    } catch (error: any) { toast.error(error.message || "Could not submit the application"); }
    finally { setSubmitting(false); }
  };

  const completedRequiredSteps = requiredSteps.filter((step) => stepStatus(step) === "completed").length;
  const progress = Math.round((completedRequiredSteps / requiredSteps.length) * 100);
  const pdfApplication: GuardApplicationData = { ...form, availability: shared, photosComplete, certificationComplete };
  const editForAnotherCompany = () => {
    setEditingSubmitted(true);
    setAcknowledged(false);
    setCurrentStep(0);
    window.localStorage.setItem(`guard-application-step:${userId}`, "1");
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("applicationStep", "1");
    setSearchParams(nextParams, { replace: true });
  };

  const startApplication = () => {
    visitedStepsRef.current = [0];
    setVisitedSteps([0]);
    completedStepsRef.current = [];
    setCompletedSteps([]);
    setCurrentStep(0);
    setApplicationStarted(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("applicationStep", "1");
    setSearchParams(nextParams, { replace: true });
  };

  if (!loaded) {
    return <div className="mx-auto flex min-h-[360px] max-w-4xl items-center justify-center rounded-2xl border bg-card text-sm text-muted-foreground">Preparing your application…</div>;
  }

  if (loaded && masterStatus === "submitted" && !editingSubmitted) {
    return (
      <><Dialog open={showSubmissionConfirmation} onOpenChange={setShowSubmissionConfirmation}><DialogContent className="max-w-md rounded-2xl"><DialogHeader><div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700"><CheckCircle2 className="h-7 w-7" /></div><DialogTitle className="text-2xl">Thank you for submitting your application</DialogTitle><DialogDescription className="text-base">Your application was successfully sent to {form.companyName || "the hiring company"}. You can leave this page—your submitted application is saved.</DialogDescription></DialogHeader><Button type="button" onClick={() => setShowSubmissionConfirmation(false)}>Done</Button></DialogContent></Dialog><section className="mx-auto w-full max-w-4xl rounded-2xl border border-green-200 bg-green-50/70 p-5 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-green-700">Application complete</p>
              <h2 className="mt-1 text-xl font-bold text-foreground sm:text-2xl">Thank you—your hiring application was submitted</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your application for {form.position || "Security Officer"} with {form.companyName || "the selected company"} is saved. The submitted company copy remains unchanged.
              </p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-semibold text-green-800">
            <Check className="h-4 w-4" /> Submitted
          </span>
        </div>
        <div className="mt-6 flex flex-col gap-3 border-t border-green-200 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => generateGuardApplicationPDF(pdfApplication)}>
            <Download className="mr-2 h-4 w-4" />Download completed PDF
          </Button>
          <Button type="button" onClick={editForAnotherCompany}>Edit Application</Button>
        </div>
      </section></>
    );
  }

  if (!applicationStarted) {
    const destination = jobs.find((job) => job.id === selectedJobId);
    return <section className="mx-auto w-full max-w-4xl overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background shadow-sm">
      <div className="px-6 py-10 sm:px-10 sm:py-14">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><ShieldCheck className="h-8 w-8" /></div>
        <p className="mt-7 text-sm font-bold uppercase tracking-[.18em] text-primary">Welcome to We Find Guards</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Let’s create your security officer application.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">You’ll add your contact information, qualifications, work availability, and signature. Your progress saves as you go, and nothing is marked complete until you finish the required information.</p>

        <div className="mt-8 rounded-2xl border-2 border-primary/20 bg-background p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Current hiring destination</p>
          <h2 className="mt-2 text-xl font-bold">{destination ? destination.companyName : "Choose your hiring destination"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{destination ? `${destination.position}${destination.city || destination.state ? ` · ${[destination.city, destination.state].filter(Boolean).join(", ")}` : ""}` : "You’ll select an active company and position in Step 1."}</p>
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">Please make sure this is the company and position you intend to apply for before submitting.</p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"><Button type="button" size="lg" onClick={startApplication}>Start Application<ArrowRight className="ml-2 h-5 w-5" /></Button><span className="text-sm text-muted-foreground">Step 1 of 10 · You can leave and return anytime</span></div>
      </div>
    </section>;
  }

  return <form id="guard-application-top" onSubmit={submit} className="mx-auto w-full max-w-6xl scroll-mt-4 pb-24 lg:pb-8">
    <div className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background"><div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:px-8"><div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><ShieldCheck className="h-7 w-7" /></div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Step {currentStep + 1}: {steps[currentStep][0]}</p><h1 className="text-xl font-bold sm:text-2xl">Security Officer Application</h1><p className="mt-1 text-sm text-muted-foreground">{completedRequiredSteps} of {requiredSteps.length} required sections completed</p>{saveError && <p className="mt-2 text-sm font-semibold text-destructive">Draft not saved. Please check your connection and try again.</p>}</div></div><span className={`flex items-center gap-1 text-xs ${saveError ? "text-destructive" : "text-muted-foreground"}`}><Cloud className="h-4 w-4" />{saveError ? "Save failed" : saving ? "Saving…" : savedAt ? `Saved ${savedAt}` : "Autosave on"}</span></div><div className="h-2 bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div></div>
    <div className="grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]"><aside className="hidden lg:block"><nav className="sticky top-4 space-y-1 rounded-2xl border bg-card p-3">{steps.map((s, i) => { const status = stepStatus(i); return <button key={s[0]} type="button" onClick={() => void go(i)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${i === currentStep ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i === currentStep ? "bg-white/20" : status === "completed" ? "bg-green-100 text-green-700" : status === "in_progress" ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>{status === "completed" ? <Check className="h-4 w-4" aria-label={`Step ${i + 1} complete`} /> : status === "in_progress" ? <PlayCircle className="h-4 w-4" aria-label={`Step ${i + 1} in progress`} /> : i + 1}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{s[0]}</span><span className={`block text-xs ${i === currentStep ? "text-white/75" : "text-muted-foreground"}`}>{status === "completed" ? "Completed" : status === "in_progress" ? "In progress" : "Not started"}</span></span></button>; })}</nav></aside>
      <main className="min-w-0"><div className="mb-4 space-y-3 lg:hidden"><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{stepStatus(currentStep) === "completed" && <Check className="h-4 w-4" />}Step {currentStep + 1} of 10</span><span className="text-sm text-muted-foreground">{progress}% required complete</span></div><select aria-label="Application section" className="h-12 w-full rounded-xl border bg-background px-3 font-medium" value={currentStep} onChange={(event) => void go(Number(event.target.value))}>{steps.map((step, index) => <option key={step[0]} value={index}>{index + 1}. {step[0]} — {stepStatus(index) === "completed" ? "Completed" : stepStatus(index) === "in_progress" ? "In progress" : "Not started"}</option>)}</select></div><Card className="min-w-0 rounded-2xl shadow-sm"><CardHeader className="border-b px-5 py-6 sm:px-8"><CardTitle className="break-words text-2xl sm:text-3xl">{steps[currentStep][0]}</CardTitle><CardDescription className="text-base">{steps[currentStep][1]}</CardDescription></CardHeader><CardContent className="min-w-0 px-5 py-7 sm:px-8 sm:py-9">
        {currentStep === 0 && <div className="space-y-6"><div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Current hiring destination</p><h3 className="mt-2 text-xl font-bold">{selectedJobId ? form.companyName : "Choose a hiring company"}</h3><p className="mt-1 text-sm text-muted-foreground">{selectedJobId ? `${form.position} · ${[form.companyCity, form.companyState].filter(Boolean).join(", ")}` : "Select an active position below."}</p><p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">Please make sure this is the company and position you intend to apply for before continuing.</p></div><div className="grid gap-5 md:grid-cols-2"><div className="min-w-0 space-y-2 md:col-span-2"><Label>Company and job location *</Label><select className="h-12 w-full min-w-0 rounded-lg border bg-background px-4" value={selectedJobId} onChange={e => { const job = jobs.find(item => item.id === e.target.value); setSelectedJobId(e.target.value); if (job) setForm(c => ({ ...c, companyName: job.companyName, position: job.position, companyCity: job.city, companyState: job.state })); }}><option value="">Select a company and position</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.companyName} — {[j.city, j.state].filter(Boolean).join(", ")} — {j.position}</option>)}</select><p className="text-sm text-muted-foreground">Companies appear here after they create an active job posting.</p></div><Field label="Position applied for" value={form.position} onChange={v => update("position", v)} required /><Field label="Available start date" value={form.startDate} onChange={v => update("startDate", v)} type="date" /></div></div>}
        {currentStep === 1 && <div className="space-y-5"><p className="rounded-xl bg-primary/5 p-4 text-sm text-muted-foreground">Information entered here is the same information shown in your Profile tab.</p><div className="grid gap-5 md:grid-cols-2"><Field label="Full legal name" value={form.applicantName} onChange={v => update("applicantName", v)} required /><Field label="Email" value={form.email} onChange={v => update("email", v)} type="email" required /><Field label="Phone" value={form.phone} onChange={v => update("phone", v)} type="tel" required /></div><AddressAutocomplete value={{ street: form.address, unit: "", city: form.city, state: form.state, zip: form.zip }} onChange={a => setForm(c => ({ ...c, address: a.street, city: a.city, state: a.state, zip: a.zip }))} /><div className="rounded-xl border p-4"><Label htmlFor="application-resume" className="text-base">Upload Resume <span className="font-normal text-muted-foreground">(optional)</span></Label><p className="mt-1 text-sm text-muted-foreground">PDF, DOC, or DOCX, up to 10 MB. Employers can download the resume with your submitted application.</p><div className="mt-4 flex flex-wrap items-center gap-3"><Input id="application-resume" type="file" accept=".pdf,.doc,.docx" onChange={uploadResume} disabled={uploadingResume} className="max-w-md" /><span className="text-sm font-medium">{uploadingResume ? "Uploading…" : resumePath ? "✓ Resume uploaded" : "No resume uploaded"}</span></div></div></div>}
        {currentStep === 2 && <div className="grid gap-7 md:grid-cols-2"><YesNo label="Are you 18 years of age or older?" value={form.isAdult} onChange={v => update("isAdult", v)} /><YesNo label="Can you provide proof that you may work in the U.S.?" value={form.eligibleToWork} onChange={v => update("eligibleToWork", v)} /><YesNo label="Do you have a valid driver's license?" value={form.driversLicense} onChange={v => update("driversLicense", v)} /><Field label="Security license number (optional)" value={form.securityLicenseNumber} onChange={v => update("securityLicenseNumber", v)} /><div className="space-y-2"><Label htmlFor="security-license-state">Security license state (optional)</Label><select id="security-license-state" className="h-12 w-full rounded-lg border bg-background px-4" value={form.securityLicenseState} onChange={e => update("securityLicenseState", e.target.value)}><option value="">Select state</option>{states.map(state => <option key={state} value={state}>{state}</option>)}</select></div></div>}
        {currentStep === 3 && <div className="space-y-6"><div className="space-y-2"><Label>Highest education, school, diploma, or degree</Label><Textarea value={form.education} onChange={e => update("education", e.target.value)} /></div><div className="space-y-3"><Label>Security training, skills, and equipment</Label><div className="grid gap-3 sm:grid-cols-2">{skillOptions.map(skill => { const selected = form.skills.split(",").map(item => item.trim()).filter(Boolean).includes(skill); return <label key={skill} className="flex items-center gap-2 rounded-lg border p-3"><Checkbox checked={selected} onCheckedChange={checked => { const current = form.skills.split(",").map(item => item.trim()).filter(Boolean); update("skills", (checked ? Array.from(new Set([...current, skill])) : current.filter(item => item !== skill)).join(", ")); }} />{skill}</label>; })}</div><p className="text-sm text-muted-foreground">Select every qualification that applies.</p></div></div>}
        {currentStep === 4 && <div className="space-y-5"><p className="text-sm text-muted-foreground">Optional. Entries save to Work History and can be edited there later.</p>{form.workHistory.map((j, i) => <div key={i} className="grid gap-4 rounded-xl border p-4 md:grid-cols-2"><div className="flex items-center justify-between md:col-span-2"><p className="font-semibold text-primary">Employer {i + 1}</p>{form.workHistory.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => setForm(current => ({ ...current, workHistory: current.workHistory.filter((_, index) => index !== i) }))}><X className="mr-1 h-4 w-4" />Remove</Button>}</div><Field label="Employer" value={j.employer || ""} onChange={v => updateList("workHistory", i, "employer", v)} /><Field label="Job title" value={j.title || ""} onChange={v => updateList("workHistory", i, "title", v)} /><Field label="Start date" type="date" value={j.startDate || ""} onChange={v => updateList("workHistory", i, "startDate", v)} /><Field label="End date" type="date" value={j.endDate || ""} onChange={v => updateList("workHistory", i, "endDate", v)} /><Field label="Supervisor" value={j.supervisor || ""} onChange={v => updateList("workHistory", i, "supervisor", v)} /><Field label="Supervisor phone" type="tel" value={j.phone || ""} onChange={v => updateList("workHistory", i, "phone", v)} /></div>)}<Button type="button" variant="outline" onClick={() => setForm(current => ({ ...current, workHistory: [...current.workHistory, { ...blankJob }] }))}><Plus className="mr-2 h-4 w-4" />Add Another Employer</Button></div>}
        {currentStep === 5 && <div className="space-y-5"><p className="text-sm text-muted-foreground">Optional professional references (not relatives).</p>{form.references.map((r, i) => <div key={i} className="grid gap-4 rounded-xl border p-4 md:grid-cols-2"><p className="font-semibold text-primary md:col-span-2">Reference {i + 1}</p><Field label="Name" value={r.name} onChange={v => updateList("references", i, "name", v)} /><Field label="Relationship" value={r.relationship} onChange={v => updateList("references", i, "relationship", v)} /><Field label="Phone" type="tel" value={r.phone} onChange={v => updateList("references", i, "phone", v)} /><Field label="Email" type="email" value={r.email} onChange={v => updateList("references", i, "email", v)} /></div>)}</div>}
        {currentStep === 6 && <Availability shared={shared} setShared={setShared} />}
        {currentStep === 7 && <OfficerPhotos userId={userId} embedded optional onChanged={setPhotos} onSaved={updatePhotoCompletion} />}
        {currentStep === 8 && <CertificationsManager officerId={activeOfficerId || ""} userId={userId} onEnsureProfile={onEnsureProfile} onChanged={updateCertifications} embedded onRegisterSave={(save) => { savePendingLicensesRef.current = save; }} />}
        {currentStep === 9 && <div className="space-y-8"><section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><p className="font-semibold">New-hire paperwork comes later</p><p className="mt-1">Form I-9, Form W-4, payroll, and company policies are completed only after you accept an employment offer.</p></section><section className="space-y-5"><h3 className="text-lg font-semibold">Certification and electronic signature</h3><p className="text-sm text-muted-foreground">I certify that this application is true and complete and authorize verification of the information provided.</p><div className="flex items-start gap-2"><Checkbox id="certify" checked={acknowledged} onCheckedChange={v => setAcknowledged(Boolean(v))} /><Label htmlFor="certify">I have read and agree to the certification above. *</Label></div><div className="grid gap-4 md:grid-cols-2"><Field label="Printed full legal name" value={form.signature} onChange={v => update("signature", v)} required /><Field label="Date signed" type="date" value={form.signatureDate} onChange={v => update("signatureDate", v)} required /></div><div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5"><SignaturePad value={form.signatureImage} suggestedName={form.signature || form.applicantName} onChange={value => update("signatureImage", value)} /></div><div className={`rounded-xl border p-4 text-sm ${complete ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"}`}><p className="font-semibold">Before you submit</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{signatureChecklist.map((item) => <p key={item.label} className={item.complete ? "text-green-800" : "font-semibold text-amber-900"}>{item.complete ? "✓" : "○"} {item.label}{item.complete ? " complete" : " required"}</p>)}</div>{missingRequiredSteps.some((step) => step !== 9) && <p className="mt-3 font-semibold text-amber-900">Also needed: {missingRequiredSteps.filter((step) => step !== 9).map((step) => requiredStepLabels[step]).join(", ")}.</p>}<p className="mt-3 text-muted-foreground">Resume, photos, and credentials are optional and do not prevent submission.</p></div></section></div>}
      </CardContent></Card><Actions current={currentStep} go={go} next={next} submit={submitting} complete={complete} form={pdfApplication} resubmitting={editingSubmitted} optionalStep={(currentStep === 7 && !photosComplete) || (currentStep === 8 && !certificationComplete)} /></main></div>
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t bg-background/95 p-3 shadow-xl backdrop-blur lg:hidden"><Button type="button" variant="outline" size="lg" onClick={() => go(currentStep - 1)} disabled={!currentStep}><ArrowLeft className="h-5 w-5" /></Button>{currentStep < 9 ? <Button type="button" size="lg" className="flex-1" onClick={next}>{(currentStep === 7 && !photosComplete) || (currentStep === 8 && !certificationComplete) ? "Skip for now" : "Continue"}<ArrowRight className="ml-2 h-5 w-5" /></Button> : <Button type="submit" size="lg" className="flex-1" disabled={submitting}><FileCheck2 className="mr-2 h-5 w-5" />{submitting ? "Submitting…" : editingSubmitted ? "Resubmit" : "Submit Application"}</Button>}</div>
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
  const setAnytime = () => setShared(current => ({
    ...current,
    shiftPreferences: ["first_shift", "second_shift", "third_shift", "weekend"],
    schedule: Object.fromEntries(days.map(day => [day, { start: "00:00", end: "23:30" }])),
  }));

  return <div className="space-y-7">
    <section className="space-y-3"><Label className="text-base">Employment type *</Label><div className="flex flex-wrap gap-5">{[["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract"]].map(([v,l]) => <label key={v} className="flex items-center gap-2 rounded-lg border px-4 py-3"><Checkbox checked={shared.employmentTypes.includes(v)} onCheckedChange={c => toggle("employmentTypes", v, Boolean(c))} />{l}</label>)}</div></section>
    <section className="space-y-3"><Label className="text-base">Preferred shift *</Label><div className="flex flex-wrap gap-5">{[["first_shift", "Day"], ["second_shift", "Evening"], ["third_shift", "Night"], ["weekend", "Weekend"]].map(([v,l]) => <label key={v} className="flex items-center gap-2 rounded-lg border px-4 py-3"><Checkbox checked={shared.shiftPreferences.includes(v)} onCheckedChange={c => toggle("shiftPreferences", v, Boolean(c))} />{l}</label>)}</div></section>
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><Label className="text-base">Weekly schedule *</Label><p className="mt-1 text-sm text-muted-foreground">Choose a start and end time, then copy that schedule to other days if needed.</p></div><Button type="button" variant="outline" onClick={setAnytime}>Anytime</Button></div>
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
function Actions({ current, go, next, submit, form, resubmitting, optionalStep }: any) { return <div className="mt-5 hidden items-center justify-between lg:flex"><Button type="button" variant="outline" onClick={() => go(current - 1)} disabled={!current}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>{current < 9 ? <Button type="button" onClick={next}>{optionalStep ? "Skip for now" : "Continue"}<ArrowRight className="ml-2 h-4 w-4" /></Button> : <div className="flex gap-3"><Button type="button" variant="outline" onClick={() => generateGuardApplicationPDF(form)}><Download className="mr-2 h-4 w-4" />Preview PDF</Button><Button type="submit" disabled={submit}><FileCheck2 className="mr-2 h-4 w-4" />{submit ? "Submitting…" : resubmitting ? "Resubmit" : "Submit Application"}</Button></div>}</div>; }
