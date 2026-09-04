import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Cloud, FileCheck2, LockKeyhole, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";

type Props = {
  userId: string;
  officerId: string | null;
  onEnsureProfile?: () => Promise<any>;
  onChanged?: () => void;
};

type OnboardingData = {
  employerName: string;
  legalFirstName: string;
  middleInitial: string;
  legalLastName: string;
  otherLastNames: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  citizenshipStatus: string;
  alienNumber: string;
  i94Number: string;
  foreignPassportNumber: string;
  passportCountry: string;
  workAuthorizationExpiration: string;
  filingStatus: string;
  multipleJobs: boolean;
  qualifyingChildren: string;
  otherDependents: string;
  otherIncome: string;
  deductions: string;
  extraWithholding: string;
  paymentMethod: string;
  bankName: string;
  bankAccountType: string;
  emergencyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  emergencyAltPhone: string;
  physicianName: string;
  medicalNotes: string;
  uniformShirt: string;
  uniformPants: string;
  uniformShoes: string;
  scheduledPost: string;
  scheduledShift: string;
  startDate: string;
  policies: Record<string, boolean>;
  signatureName: string;
  signatureDate: string;
};

const policyItems = [
  ["handbook", "Employee handbook"],
  ["property", "Company property and equipment"],
  ["confidentiality", "Confidentiality agreement"],
  ["temporary", "Temporary employment acknowledgement"],
  ["appearance", "Personal appearance standards"],
  ["attendance", "Attendance and punctuality"],
  ["discipline", "Disciplinary action policy"],
  ["drug", "Drug- and alcohol-free workplace"],
  ["social", "Social and digital media conduct"],
  ["workersComp", "Workers’ compensation notice"],
] as const;

const steps = [
  ["Welcome", "Confirm your hiring company"],
  ["Form I-9", "Complete the employee section in the app"],
  ["Form W-4", "Enter federal withholding information"],
  ["Pay setup", "Choose payment and direct deposit"],
  ["Emergency contact", "Tell us who to contact"],
  ["Company policies", "Review employer acknowledgements"],
  ["Uniform and schedule", "Confirm assignment details"],
  ["Review and sign", "Submit your onboarding packet"],
] as const;

const initialData: OnboardingData = {
  employerName: "Hiring company", legalFirstName: "", middleInitial: "", legalLastName: "", otherLastNames: "",
  address: "", city: "", state: "", zip: "", dateOfBirth: "", email: "", phone: "", citizenshipStatus: "",
  alienNumber: "", i94Number: "", foreignPassportNumber: "", passportCountry: "", workAuthorizationExpiration: "",
  filingStatus: "", multipleJobs: false, qualifyingChildren: "", otherDependents: "", otherIncome: "", deductions: "", extraWithholding: "",
  paymentMethod: "direct_deposit", bankName: "", bankAccountType: "checking", emergencyName: "", emergencyRelationship: "",
  emergencyPhone: "", emergencyAltPhone: "", physicianName: "", medicalNotes: "", uniformShirt: "", uniformPants: "", uniformShoes: "",
  scheduledPost: "", scheduledShift: "", startDate: "", policies: {}, signatureName: "", signatureDate: new Date().toISOString().slice(0, 10),
};

function Field({ label, value, onChange, type = "text", required = false, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  const id = `employee-onboarding-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (type === "date") return <DatePicker id={id} label={label} value={value} onChange={onChange} required={required} />;
  return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}{required ? " *" : ""}</Label><Input id={id} className="h-12 text-base" type={type} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></div>;
}

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <div className="space-y-3"><Label>{label} *</Label><RadioGroup value={value} onValueChange={onChange} className="grid gap-3 sm:grid-cols-2">{options.map(option => <label key={option} className="flex cursor-pointer items-center gap-3 rounded-xl border p-4"><RadioGroupItem value={option} /> <span className="text-sm font-medium">{option}</span></label>)}</RadioGroup></div>;
}

export function OfficerEmployeeOnboarding({ userId, officerId, onEnsureProfile, onChanged }: Props) {
  const [activeOfficerId, setActiveOfficerId] = useState(officerId);
  const [packetId, setPacketId] = useState<string | null>(null);
  const [hiringApplicationId, setHiringApplicationId] = useState<string | null>(null);
  const [data, setData] = useState(initialData);
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState<"draft" | "submitted">("draft");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ssn, setSsn] = useState("");
  const [ssnMasked, setSsnMasked] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankMasked, setBankMasked] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const packetIdRef = useRef<string | null>(null);

  const update = <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => setData(current => ({ ...current, [key]: value }));

  useEffect(() => { if (officerId) setActiveOfficerId(officerId); }, [officerId]);
  useEffect(() => { packetIdRef.current = packetId; }, [packetId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let resolved = officerId;
      if (!resolved && onEnsureProfile) resolved = (await onEnsureProfile())?.id || null;
      if (!mounted || !resolved) return;
      setActiveOfficerId(resolved);
      const [profileResult, officerResult, hiringResult, maskedResult] = await Promise.all([
        supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle(),
        supabase.from("officer_profiles").select("phone,address_street,address_city,address_state,address_zip").eq("id", resolved).maybeSingle(),
        (supabase as any).from("guard_hiring_applications").select("id,company_name,application_data").eq("officer_id", resolved).eq("application_type", "employer_copy").eq("status", "submitted").order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.functions.invoke("manage-sensitive-data", { body: { action: "get_masked_data", data: {} } }),
      ]);
      const hiring = hiringResult.data;
      const existing = await (supabase as any).from("officer_onboarding_packets").select("*").eq("officer_id", resolved).eq("hiring_application_id", hiring?.id || null).maybeSingle();
      if (!mounted) return;
      const fullName = (profileResult.data?.full_name || "").trim().split(/\s+/);
      const saved = existing.data?.form_data || {};
      setData({
        ...initialData,
        legalFirstName: fullName[0] || "",
        legalLastName: fullName.slice(1).join(" "),
        email: profileResult.data?.email || "",
        phone: officerResult.data?.phone || "",
        address: officerResult.data?.address_street || "",
        city: officerResult.data?.address_city || "",
        state: officerResult.data?.address_state || "",
        zip: officerResult.data?.address_zip || "",
        employerName: hiring?.company_name || hiring?.application_data?.companyName || "Your hiring company",
        ...saved,
      });
      setHiringApplicationId(hiring?.id || null);
      setPacketId(existing.data?.id || null);
      setCurrentStep(Math.min(Number(existing.data?.current_step || 0), 7));
      setStatus(existing.data?.status === "submitted" ? "submitted" : "draft");
      setSsnMasked(maskedResult.data?.data?.ssn_last_four || "");
      setBankMasked(maskedResult.data?.data?.bank_account_last_four || "");
      setLoaded(true);
    })().catch(error => { console.error(error); setSaveError("Onboarding could not be loaded"); });
    return () => { mounted = false; };
  }, [userId, officerId]);

  const saveDraft = async (step = currentStep) => {
    if (!loaded || !activeOfficerId) return false;
    setSaving(true);
    try {
      const payload: any = {
        user_id: userId, officer_id: activeOfficerId, hiring_application_id: hiringApplicationId,
        company_name: data.employerName, status, current_step: step, form_data: data,
        signature_name: data.signatureName || null, signature_date: data.signatureDate || null,
        updated_at: new Date().toISOString(),
      };
      const currentId = packetIdRef.current;
      const result = currentId
        ? await (supabase as any).from("officer_onboarding_packets").update(payload).eq("id", currentId).select("id").single()
        : await (supabase as any).from("officer_onboarding_packets").insert(payload).select("id").single();
      if (result.error) throw result.error;
      if (result.data?.id) { packetIdRef.current = result.data.id; setPacketId(result.data.id); }
      setSaveError(null); setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      return true;
    } catch (error: any) {
      console.error("Onboarding autosave failed", error); setSaveError(error.message || "Draft could not be saved"); return false;
    } finally { setSaving(false); }
  };

  useEffect(() => {
    if (!loaded || !activeOfficerId || status === "submitted") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void saveDraft(); }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [data, currentStep, loaded, activeOfficerId, status]);

  const policiesComplete = policyItems.every(([key]) => data.policies[key]);
  const completeStep = (step: number) => step === 0 ? Boolean(hiringApplicationId)
    : step === 1 ? Boolean(data.legalFirstName && data.legalLastName && data.address && data.city && data.state && data.zip && data.dateOfBirth && data.citizenshipStatus && (ssnMasked || /^\d{3}-\d{2}-\d{4}$/.test(ssn)))
    : step === 2 ? Boolean(data.filingStatus)
    : step === 3 ? data.paymentMethod === "paper_check" || Boolean((bankMasked || accountNumber) && (data.bankName || bankMasked))
    : step === 4 ? Boolean(data.emergencyName && data.emergencyRelationship && data.emergencyPhone)
    : step === 5 ? policiesComplete
    : step === 6 ? Boolean(data.startDate)
    : Boolean(data.signatureName && data.signatureDate);
  const allComplete = useMemo(() => Array.from({ length: 8 }, (_, index) => completeStep(index)).every(Boolean), [data, ssn, ssnMasked, accountNumber, bankMasked, hiringApplicationId]);

  const saveSensitiveForStep = async (step: number) => {
    if (step === 1 && ssn) {
      const result = await supabase.functions.invoke("manage-sensitive-data", { body: { action: "save_ssn", data: { ssn } } });
      if (result.error || result.data?.error) throw new Error(result.data?.error || result.error?.message || "SSN could not be saved");
      setSsnMasked(result.data.ssn_last_four); setSsn("");
    }
    if (step === 3 && data.paymentMethod === "direct_deposit" && (routingNumber || accountNumber)) {
      const result = await supabase.functions.invoke("manage-sensitive-data", { body: { action: "save_bank", data: { bank_name: data.bankName, routing_number: routingNumber.replace(/\D/g, ""), account_number: accountNumber.replace(/\D/g, ""), account_type: data.bankAccountType } } });
      if (result.error || result.data?.error) throw new Error(result.data?.error || result.error?.message || "Bank information could not be saved");
      setBankMasked(result.data.bank_account_last_four); setRoutingNumber(""); setAccountNumber("");
    }
  };

  const go = async (nextStep: number) => {
    const destination = Math.max(0, Math.min(7, nextStep));
    try {
      await saveSensitiveForStep(currentStep);
      if (!(await saveDraft(destination))) throw new Error("Your progress could not be saved");
      setCurrentStep(destination);
      requestAnimationFrame(() => document.getElementById("employee-onboarding-top")?.scrollIntoView({ behavior: "auto", block: "start" }));
    } catch (error: any) { toast.error(error.message || "Your progress could not be saved"); }
  };

  const next = async () => {
    if (!completeStep(currentStep)) { toast.error("Complete the required fields before continuing"); return; }
    await go(currentStep + 1);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!allComplete || !packetIdRef.current) { toast.error("Complete each required onboarding step before submitting"); return; }
    setSubmitting(true);
    try {
      await saveSensitiveForStep(currentStep);
      const { error } = await (supabase as any).from("officer_onboarding_packets").update({ status: "submitted", current_step: 7, form_data: data, signature_name: data.signatureName, signature_date: data.signatureDate, submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", packetIdRef.current);
      if (error) throw error;
      setStatus("submitted"); toast.success("Employee onboarding packet submitted"); onChanged?.();
    } catch (error: any) { toast.error(error.message || "Onboarding could not be submitted"); }
    finally { setSubmitting(false); }
  };

  const progress = Math.round(((currentStep + 1) / steps.length) * 100);
  if (!loaded) return <Card className="rounded-2xl"><CardContent className="p-8 text-center text-muted-foreground">Loading employee onboarding…</CardContent></Card>;

  return <form id="employee-onboarding-top" onSubmit={submit} className="mx-auto w-full max-w-6xl scroll-mt-4 pb-24 lg:pb-8">
    <div className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
      <div className="flex items-center gap-3 px-5 py-5 sm:px-8"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><ShieldCheck className="h-7 w-7" /></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">We Find Guards</p><h1 className="text-xl font-bold sm:text-2xl">Employee Onboarding</h1><p className="mt-1 text-sm text-muted-foreground">Complete your hiring paperwork in the app. Your progress saves automatically.</p>{saveError && <p className="mt-2 text-sm font-semibold text-destructive">Draft not saved. Please try again.</p>}</div><span className={`hidden items-center gap-1 text-xs sm:flex ${saveError ? "text-destructive" : "text-muted-foreground"}`}><Cloud className="h-4 w-4" />{saveError ? "Save failed" : saving ? "Saving…" : savedAt ? `Saved ${savedAt}` : "Autosave on"}</span></div>
      <div className="h-2 bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
    </div>
    {status === "submitted" && <div className="mb-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-800"><CheckCircle2 className="h-5 w-5" /><div><p className="font-semibold">Onboarding submitted</p><p className="text-sm">Your completed packet is available to {data.employerName}.</p></div></div>}
    <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="hidden lg:block"><nav className="sticky top-4 space-y-1 rounded-2xl border bg-card p-3">{steps.map((step, index) => <button key={step[0]} type="button" onClick={() => go(index)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${index === currentStep ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index === currentStep ? "bg-white/20" : completeStep(index) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{completeStep(index) && index !== currentStep ? <Check className="h-4 w-4" /> : index + 1}</span><span className="min-w-0"><span className="block text-sm font-semibold">{step[0]}</span><span className={`block truncate text-xs ${index === currentStep ? "text-white/75" : "text-muted-foreground"}`}>{step[1]}</span></span></button>)}</nav></aside>
      <main className="min-w-0"><div className="mb-4 flex justify-between lg:hidden"><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">Step {currentStep + 1} of 8</span><span className="text-sm text-muted-foreground">{progress}% complete</span></div>
        <Card className="rounded-2xl shadow-sm"><CardHeader className="border-b px-5 py-6 sm:px-8"><CardTitle className="text-2xl sm:text-3xl">{steps[currentStep][0]}</CardTitle><CardDescription className="text-base">{steps[currentStep][1]}</CardDescription></CardHeader><CardContent className="px-5 py-7 sm:px-8 sm:py-9">
          {currentStep === 0 && <div className="space-y-6"><div className="rounded-2xl border border-primary/20 bg-primary/5 p-6"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Onboarding destination</p><h2 className="mt-2 text-2xl font-bold">{data.employerName}</h2><p className="mt-2 text-muted-foreground">This employee packet follows your submitted hiring application. We Find Guards securely saves your forms and sends the completed packet to this employer.</p></div>{!hiringApplicationId && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Submit a hiring application to a company before beginning employee onboarding.</div>}<div className="flex items-start gap-3 rounded-xl border p-4"><LockKeyhole className="mt-0.5 h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground"><strong className="text-foreground">Sensitive information is encrypted.</strong> SSN and bank numbers are not stored in the ordinary onboarding draft or displayed back in full.</p></div></div>}
          {currentStep === 1 && <div className="space-y-6"><div className="rounded-xl bg-primary/5 p-4 text-sm"><strong>USCIS Form I-9 — Section 1.</strong> You complete the employee portion here. Your employer is responsible for document review and Section 2.</div><div className="grid gap-5 md:grid-cols-3"><Field label="Legal first name" value={data.legalFirstName} onChange={v => update("legalFirstName", v)} required /><Field label="Middle initial" value={data.middleInitial} onChange={v => update("middleInitial", v)} /><Field label="Legal last name" value={data.legalLastName} onChange={v => update("legalLastName", v)} required /><div className="md:col-span-3"><Field label="Other last names used" value={data.otherLastNames} onChange={v => update("otherLastNames", v)} /></div><div className="md:col-span-3"><Field label="Street address" value={data.address} onChange={v => update("address", v)} required /></div><Field label="City" value={data.city} onChange={v => update("city", v)} required /><Field label="State" value={data.state} onChange={v => update("state", v)} required /><Field label="ZIP code" value={data.zip} onChange={v => update("zip", v)} required /><Field label="Date of birth" type="date" value={data.dateOfBirth} onChange={v => update("dateOfBirth", v)} required /><Field label="Email" type="email" value={data.email} onChange={v => update("email", v)} required /><Field label="Phone" type="tel" value={data.phone} onChange={v => update("phone", v)} required /></div><div className="rounded-xl border p-4"><Field label={ssnMasked ? `Social Security number (saved as ${ssnMasked})` : "Social Security number"} value={ssn} onChange={setSsn} placeholder="XXX-XX-XXXX" required={!ssnMasked} /><p className="mt-2 text-xs text-muted-foreground">Encrypted when you continue; the full number will not be displayed again.</p></div><Choice label="Citizenship or immigration status" value={data.citizenshipStatus} onChange={v => update("citizenshipStatus", v)} options={["U.S. citizen", "Noncitizen national", "Lawful permanent resident", "Authorized to work until a specified date"]} />{data.citizenshipStatus === "Lawful permanent resident" && <Field label="USCIS or A-Number" value={data.alienNumber} onChange={v => update("alienNumber", v)} required />}{data.citizenshipStatus === "Authorized to work until a specified date" && <div className="grid gap-5 md:grid-cols-2"><Field label="Work authorization expiration" type="date" value={data.workAuthorizationExpiration} onChange={v => update("workAuthorizationExpiration", v)} required /><Field label="USCIS / A-Number" value={data.alienNumber} onChange={v => update("alienNumber", v)} /><Field label="Form I-94 number" value={data.i94Number} onChange={v => update("i94Number", v)} /><Field label="Foreign passport number" value={data.foreignPassportNumber} onChange={v => update("foreignPassportNumber", v)} /><Field label="Country of issuance" value={data.passportCountry} onChange={v => update("passportCountry", v)} /></div>}</div>}
          {currentStep === 2 && <div className="space-y-7"><div className="rounded-xl bg-primary/5 p-4 text-sm"><strong>IRS Form W-4 — Employee’s Withholding Certificate.</strong> Enter the same choices you would place on the official form, without leaving We Find Guards.</div><Choice label="Federal filing status" value={data.filingStatus} onChange={v => update("filingStatus", v)} options={["Single or Married filing separately", "Married filing jointly or Qualifying surviving spouse", "Head of household"]} /><label className="flex items-start gap-3 rounded-xl border p-4"><Checkbox checked={data.multipleJobs} onCheckedChange={value => update("multipleJobs", Boolean(value))} /><span><span className="block font-medium">Multiple jobs or spouse works</span><span className="text-sm text-muted-foreground">Use this if there are only two jobs total or complete the IRS multiple-jobs calculation.</span></span></label><div className="grid gap-5 md:grid-cols-2"><Field label="Qualifying children under 17" type="number" value={data.qualifyingChildren} onChange={v => update("qualifyingChildren", v)} /><Field label="Other dependents" type="number" value={data.otherDependents} onChange={v => update("otherDependents", v)} /><Field label="Other income" type="number" value={data.otherIncome} onChange={v => update("otherIncome", v)} /><Field label="Deductions" type="number" value={data.deductions} onChange={v => update("deductions", v)} /><Field label="Extra withholding each pay period" type="number" value={data.extraWithholding} onChange={v => update("extraWithholding", v)} /></div><p className="text-xs text-muted-foreground">We Find Guards does not provide tax advice. If you are unsure what to enter, consult the official IRS instructions or a tax professional.</p></div>}
          {currentStep === 3 && <div className="space-y-7"><Choice label="How would you like to be paid?" value={data.paymentMethod} onChange={v => update("paymentMethod", v)} options={["direct_deposit", "paper_check"]} />{data.paymentMethod === "direct_deposit" && <div className="space-y-5 rounded-2xl border p-5"><div className="flex items-center gap-2"><LockKeyhole className="h-5 w-5 text-primary" /><h3 className="font-semibold">Encrypted direct deposit</h3></div>{bankMasked && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">Bank account saved securely as {bankMasked}. Enter new numbers only to replace it.</p>}<div className="grid gap-5 md:grid-cols-2"><Field label="Bank name" value={data.bankName} onChange={v => update("bankName", v)} required={!bankMasked} /><Choice label="Account type" value={data.bankAccountType} onChange={v => update("bankAccountType", v)} options={["checking", "savings"]} /><Field label="9-digit routing number" value={routingNumber} onChange={setRoutingNumber} required={!bankMasked} /><Field label="Account number" value={accountNumber} onChange={setAccountNumber} required={!bankMasked} /></div></div>}</div>}
          {currentStep === 4 && <div className="space-y-6"><div className="grid gap-5 md:grid-cols-2"><Field label="Emergency contact name" value={data.emergencyName} onChange={v => update("emergencyName", v)} required /><Field label="Relationship" value={data.emergencyRelationship} onChange={v => update("emergencyRelationship", v)} required /><Field label="Primary phone" type="tel" value={data.emergencyPhone} onChange={v => update("emergencyPhone", v)} required /><Field label="Alternate phone" type="tel" value={data.emergencyAltPhone} onChange={v => update("emergencyAltPhone", v)} /><Field label="Physician name" value={data.physicianName} onChange={v => update("physicianName", v)} /></div><div className="space-y-2"><Label>Medical or emergency instructions</Label><Textarea rows={4} value={data.medicalNotes} onChange={event => update("medicalNotes", event.target.value)} /></div></div>}
          {currentStep === 5 && <div className="space-y-4"><p className="text-sm text-muted-foreground">These acknowledgements mirror the Kairos onboarding packet. The hiring company can provide its complete policy text for review before you sign.</p>{policyItems.map(([key, label]) => <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border p-4"><Checkbox checked={Boolean(data.policies[key])} onCheckedChange={value => update("policies", { ...data.policies, [key]: Boolean(value) })} /><span><span className="block font-medium">{label}</span><span className="text-sm text-muted-foreground">I have received, reviewed, and agree to follow this policy.</span></span></label>)}</div>}
          {currentStep === 6 && <div className="space-y-6"><div><h3 className="text-lg font-semibold">Uniform information</h3><p className="text-sm text-muted-foreground">Your employer can use these details to prepare issued equipment.</p></div><div className="grid gap-5 md:grid-cols-3"><Field label="Shirt size" value={data.uniformShirt} onChange={v => update("uniformShirt", v)} /><Field label="Pants size" value={data.uniformPants} onChange={v => update("uniformPants", v)} /><Field label="Shoe size" value={data.uniformShoes} onChange={v => update("uniformShoes", v)} /></div><div className="border-t pt-6"><h3 className="mb-4 text-lg font-semibold">Assignment and schedule</h3><div className="grid gap-5 md:grid-cols-2"><Field label="Post or assignment" value={data.scheduledPost} onChange={v => update("scheduledPost", v)} /><Field label="Expected shift" value={data.scheduledShift} onChange={v => update("scheduledShift", v)} /><Field label="Employment start date" type="date" value={data.startDate} onChange={v => update("startDate", v)} required /></div></div></div>}
          {currentStep === 7 && <div className="space-y-7"><div className="rounded-2xl border bg-muted/30 p-5"><h3 className="font-semibold">Packet review</h3><div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">{steps.slice(1, 7).map((step, index) => <div key={step[0]} className="flex items-center gap-2">{completeStep(index + 1) ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <span className="h-4 w-4 rounded-full border" />} {step[0]}</div>)}</div></div><div className="rounded-xl bg-primary/5 p-4 text-sm">By signing, I certify that the information I entered is true and complete, that I completed the employee portions of the government forms, and that my electronic signature has the same effect as a handwritten signature.</div><div className="grid gap-5 md:grid-cols-2"><Field label="Full legal name as signature" value={data.signatureName} onChange={v => update("signatureName", v)} required /><Field label="Date signed" type="date" value={data.signatureDate} onChange={v => update("signatureDate", v)} required /></div></div>}
        </CardContent></Card>
        <div className="mt-5 hidden items-center justify-between lg:flex"><Button type="button" variant="outline" onClick={() => go(currentStep - 1)} disabled={!currentStep}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>{currentStep < 7 ? <Button type="button" onClick={next} disabled={saving}>Save and continue<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button type="submit" disabled={submitting || !allComplete || status === "submitted"}><FileCheck2 className="mr-2 h-4 w-4" />{status === "submitted" ? "Submitted" : submitting ? "Submitting…" : "Submit onboarding"}</Button>}</div>
      </main>
    </div>
    <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t bg-background/95 p-3 shadow-xl backdrop-blur lg:hidden"><Button type="button" variant="outline" size="lg" onClick={() => go(currentStep - 1)} disabled={!currentStep}><ArrowLeft className="h-5 w-5" /></Button>{currentStep < 7 ? <Button type="button" size="lg" className="flex-1" onClick={next} disabled={saving}>Save and continue<ArrowRight className="ml-2 h-5 w-5" /></Button> : <Button type="submit" size="lg" className="flex-1" disabled={submitting || !allComplete || status === "submitted"}><FileCheck2 className="mr-2 h-5 w-5" />{status === "submitted" ? "Submitted" : "Submit onboarding"}</Button>}</div>
  </form>;
}
