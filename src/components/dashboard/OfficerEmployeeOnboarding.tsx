import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronUp, Cloud, Eye, EyeOff, FileCheck2, LockKeyhole, Maximize2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { buildDirectDeposit, buildI9, buildPolicyAcknowledgement, buildW4, pdfUrl } from "@/lib/officialOnboardingForms";

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
  apartmentNumber: string;
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
  otherCredits: string;
  otherIncome: string;
  deductions: string;
  extraWithholding: string;
  exemptFromWithholding: boolean;
  paymentMethod: string;
  bankName: string;
  bankAccountType: string;
  bankAuthorizationAccepted: boolean;
  bankSignatureName: string;
  bankSignatureDate: string;
  bankSignatureImage: string;
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
  offeredPosition: string;
  hourlyRate: string;
  employeeIdNumber: string;
  trackTikUsername: string;
  trackTikPasswordSet: boolean;
  issuedItems: Record<string, boolean>;
  policies: Record<string, boolean>;
  policyAcknowledgements: Record<string, PolicyAcknowledgement>;
  availabilitySchedule: Record<string, { start?: string; end?: string }>;
  signatureName: string;
  signatureDate: string;
  signatureImage: string;
  w4SignatureName: string;
  w4SignatureDate: string;
  w4SignatureImage: string;
};

type PolicyAcknowledgement = {
  viewedAt: string;
  printedName: string;
  employeeTitle: string;
  signatureDate: string;
  signatureImage: string;
  accepted: boolean;
  notes: string;
  documentFields: Record<string, string>;
};

type BankAccountDraft = {
  id: string;
  bankName: string;
  bankCity: string;
  bankState: string;
  accountType: "checking" | "savings" | "other";
  routingNumber: string;
  accountNumber: string;
  allocationType: "amount" | "entire";
  allocationAmount: string;
};

type SavedBankAccount = Omit<BankAccountDraft, "id" | "routingNumber" | "accountNumber"> & {
  routingLastFour: string;
  accountLastFour: string;
};

const newBankAccount = (allocationType: "amount" | "entire" = "entire", id = `bank-${Date.now()}`): BankAccountDraft => ({
  id,
  bankName: "",
  bankCity: "",
  bankState: "",
  accountType: "checking",
  routingNumber: "",
  accountNumber: "",
  allocationType,
  allocationAmount: "",
});

const policyItems = [
  ["property", "Company property and equipment", "/forms/07-receipt-company-property.pdf"],
  ["confidentiality", "Confidentiality agreement", "/forms/09-confidentialityagreement.pdf"],
  ["offer", "Offer letter", "/forms/10-offer-letter-per-hour.pdf"],
  ["trackTik", "TrackTik login and usage", "/forms/11-track-tik-login-info-sheet.pdf"],
  ["temporary", "Temporary employment acknowledgement", "/forms/12-temporary-employeement-acknowldgement.pdf"],
  ["appearance", "Personal appearance standards", "/forms/13-personal-appearance.pdf"],
  ["attendance", "Attendance and punctuality", "/forms/14-attendance-punctuality.pdf"],
  ["discipline", "Disciplinary action policy", "/forms/15-disciplinary-action.pdf"],
  ["drug", "Drug and alcohol policy", "/forms/16-drug-abuse.pdf"],
  ["drugTest", "Drug testing consent", "/forms/17-drug-free-policy.pdf"],
  ["availability", "Employee availability acknowledgement", "/forms/18-employee-availability.pdf"],
  ["jobDescription", "Security officer job description", "/forms/20-job-description.pdf"],
  ["social", "Social and digital media conduct", "/forms/21-social-and-digital-media-code-of-conduct-for-your-organization.pdf"],
  ["workersComp", "Workers’ compensation notice", "/forms/22-texas-department-of-insurance.pdf"],
  ["uniform", "Uniform receipt and return checklist", "/forms/23-uniform-check-list.pdf"],
  ["schedule", "Initial work schedule", "/forms/24-kairos-schedule.pdf"],
  ["handbook", "Employee handbook acknowledgment", "/forms/06-acknowledgement-of-handbook.pdf"],
] as const;

const propertyEquipmentRows = [
  ["Building KeyCard", "Building key/card"],
  ["Identification Badge", "Identification badge"],
  ["Mobile Device Enter service provider and model", "Mobile device"],
  ["Parking Pass", "Parking pass"],
  ["Credit Card Enter issuer last four digits and expiration date", "Company credit card"],
  ["Home Computer Enter make and model", "Home computer"],
  ["Laptop Computer Enter make and model", "Laptop computer"],
  ["Printer Copier Scanner", "Printer/copier/scanner"],
] as const;

const propertyAdditionalRows = [
  ["Fax machine", "Fax machine"],
  ["Company Car Enter year make model mileage", "Company vehicle"],
  ["Customer Contact List", "Customer contact list"],
  ["CoWorker Contact List", "Coworker contact list"],
  ["Other Enter Details", "Other item 1"],
  ["Other Enter Details_2", "Other item 2"],
] as const;

const issuedItemOptions = ["Building key/card", "Identification badge", "Mobile device", "Parking pass", "Laptop", "Uniform", "Radio", "Flashlight"];

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
  employerName: "Hiring company",
  legalFirstName: "",
  middleInitial: "",
  legalLastName: "",
  otherLastNames: "",
  address: "",
  apartmentNumber: "",
  city: "",
  state: "",
  zip: "",
  dateOfBirth: "",
  email: "",
  phone: "",
  citizenshipStatus: "",
  alienNumber: "",
  i94Number: "",
  foreignPassportNumber: "",
  passportCountry: "",
  workAuthorizationExpiration: "",
  filingStatus: "",
  multipleJobs: false,
  qualifyingChildren: "",
  otherDependents: "",
  otherCredits: "",
  otherIncome: "",
  deductions: "",
  extraWithholding: "",
  exemptFromWithholding: false,
  paymentMethod: "direct_deposit",
  bankName: "",
  bankAccountType: "checking",
  bankAuthorizationAccepted: false,
  bankSignatureName: "",
  bankSignatureDate: new Date().toISOString().slice(0, 10),
  bankSignatureImage: "",
  emergencyName: "",
  emergencyRelationship: "",
  emergencyPhone: "",
  emergencyAltPhone: "",
  physicianName: "",
  medicalNotes: "",
  uniformShirt: "",
  uniformPants: "",
  uniformShoes: "",
  scheduledPost: "",
  scheduledShift: "",
  startDate: "",
  policies: {},
  policyAcknowledgements: {},
  availabilitySchedule: {},
  signatureName: "",
  signatureDate: new Date().toISOString().slice(0, 10),
  signatureImage: "",
  w4SignatureName: "",
  w4SignatureDate: new Date().toISOString().slice(0, 10),
  w4SignatureImage: "",
  offeredPosition: "Security Officer",
  hourlyRate: "",
  employeeIdNumber: "",
  trackTikUsername: "",
  trackTikPasswordSet: false,
  issuedItems: {},
};

const formatSsn = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
};

const isValidSsn = (value: string) => /^\d{9}$/.test(value.replace(/\D/g, ""));
const maskSsn = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length <= 5 ? formatSsn(digits) : `XXX-XX-${digits.slice(5)}`;
};

const functionErrorMessage = async (result: any, fallback: string) => {
  if (result?.data?.error) return String(result.data.error);
  const context = result?.error?.context;
  if (context && typeof context.clone === "function") {
    try {
      const payload = await context.clone().json();
      if (payload?.error) return String(payload.error);
    } catch {
      // The function may have returned a non-JSON gateway response.
    }
  }
  return result?.error?.message || fallback;
};

function Field({ label, value, onChange, type = "text", required = false, placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  const id = `employee-onboarding-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  if (type === "date") return <DatePicker id={id} label={label} value={value} onChange={onChange} required={required} />;
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Input id={id} className="h-12 text-base" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Choice({ label, value, onChange, options, optionLabels = {}, stacked = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; optionLabels?: Record<string, string>; stacked?: boolean }) {
  return (
    <div className="space-y-3">
      <Label>{label} *</Label>
      <RadioGroup value={value} onValueChange={onChange} className={`grid min-w-0 gap-3 ${stacked ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {options.map((option) => (
          <label key={option} className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-4">
            <RadioGroupItem value={option} className="shrink-0" />
            <span className="min-w-0 break-words text-sm font-medium">{optionLabels[option] ?? option}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
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
  const [submittingI9, setSubmittingI9] = useState(false);
  const [i9SubmittedAt, setI9SubmittedAt] = useState<string | null>(null);
  const [submittingW4, setSubmittingW4] = useState(false);
  const [w4SubmittedAt, setW4SubmittedAt] = useState<string | null>(null);
  const [ssn, setSsn] = useState("");
  const [ssnMasked, setSsnMasked] = useState("");
  const [showSsn, setShowSsn] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccountDraft[]>(() => [newBankAccount("entire", "bank-1")]);
  const [savedBankAccounts, setSavedBankAccounts] = useState<SavedBankAccount[]>([]);
  const [activePolicyKey, setActivePolicyKey] = useState<string | null>(null);
  const [policyPreview, setPolicyPreview] = useState<{ key: string; url: string; page: number } | null>(null);
  const [i9Url, setI9Url] = useState("/forms/02-i-9-2026.pdf");
  const [w4Url, setW4Url] = useState("/forms/W-4_Form_2026.pdf");
  const [directDepositUrl, setDirectDepositUrl] = useState("/forms/04-direct-deposit-auth-form.pdf");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const packetIdRef = useRef<string | null>(null);

  const update = <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => setData((current) => ({ ...current, [key]: value }));
  const updateBankAccount = <K extends keyof BankAccountDraft>(id: string, key: K, value: BankAccountDraft[K]) => {
    setBankAccounts((current) => current.map((account) => account.id === id ? { ...account, [key]: value } : account));
  };
  const addBankAccount = () => {
    setBankAccounts((current) => current.length >= 3 ? current : [
      ...current.map((account) => ({ ...account, allocationType: "amount" as const })),
      newBankAccount("entire"),
    ]);
  };
  const removeBankAccount = (id: string) => {
    setBankAccounts((current) => {
      const remaining = current.filter((account) => account.id !== id);
      return remaining.map((account, index) => ({ ...account, allocationType: index === remaining.length - 1 ? "entire" as const : "amount" as const }));
    });
  };
  const handleSsnChange = (nextValue: string) => {
    if (showSsn || !/[xX]/.test(nextValue)) { setSsn(formatSsn(nextValue)); return; }
    const currentDigits = ssn.replace(/\D/g, "");
    const visibleDigits = nextValue.replace(/\D/g, "");
    const nextLength = (nextValue.match(/[xX]/g) || []).length + visibleDigits.length;
    if (nextLength < currentDigits.length) setSsn(formatSsn(currentDigits.slice(0, nextLength)));
    else if (nextLength > currentDigits.length && visibleDigits) setSsn(formatSsn(`${currentDigits}${visibleDigits.slice(-1)}`));
  };

  useEffect(() => {
    if (officerId) setActiveOfficerId(officerId);
  }, [officerId]);
  useEffect(() => {
    packetIdRef.current = packetId;
  }, [packetId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      let resolved = officerId;
      if (!resolved && onEnsureProfile) resolved = (await onEnsureProfile())?.id || null;
      if (!mounted || !resolved) return;
      setActiveOfficerId(resolved);
      const [profileResult, officerResult, hiringResult, maskedResult] = await Promise.all([
        supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle(),
        supabase.from("officer_profiles").select("phone,address_street,address_city,address_state,address_zip,availability_schedule,title").eq("id", resolved).maybeSingle(),
        (supabase as any).from("guard_hiring_applications").select("id,company_name,application_data").eq("officer_id", resolved).eq("application_type", "employer_copy").eq("status", "submitted").order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.functions.invoke("manage-sensitive-data", {
          body: { action: "get_masked_data", data: {} },
        }),
      ]);
      const hiring = hiringResult.data;
      const existing = await (supabase as any)
        .from("officer_onboarding_packets")
        .select("*")
        .eq("officer_id", resolved)
        .eq("hiring_application_id", hiring?.id || null)
        .maybeSingle();
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
        offeredPosition: hiring?.position || hiring?.application_data?.position || officerResult.data?.title || "Security Officer",
        availabilitySchedule: (officerResult.data as any)?.availability_schedule || {},
        employerName: hiring?.company_name || hiring?.application_data?.companyName || "Your hiring company",
        ...saved,
      });
      setHiringApplicationId(hiring?.id || null);
      setPacketId(existing.data?.id || null);
      setCurrentStep(Math.min(Number(existing.data?.current_step || 0), 7));
      setStatus(existing.data?.status === "submitted" ? "submitted" : "draft");
      setI9SubmittedAt(existing.data?.i9_submitted_at || null);
      setW4SubmittedAt(existing.data?.w4_submitted_at || null);
      setSsnMasked(maskedResult.data?.data?.ssn_last_four || "");
      const maskedBankData = maskedResult.data?.data;
      const maskedAccounts = Array.isArray(maskedBankData?.bank_accounts) ? maskedBankData.bank_accounts : maskedBankData?.bank_account_last_four ? [{
        bankName: maskedBankData.bank_name || "Saved bank",
        bankCity: "",
        bankState: "",
        accountType: maskedBankData.bank_account_type || "checking",
        allocationType: "entire",
        allocationAmount: "",
        routingLastFour: maskedBankData.bank_routing_last_four || "",
        accountLastFour: maskedBankData.bank_account_last_four,
      }] : [];
      setSavedBankAccounts(maskedAccounts);
      if (maskedAccounts.length) setBankAccounts([]);
      setLoaded(true);
    })().catch((error) => {
      console.error(error);
      setSaveError("Onboarding could not be loaded");
    });
    return () => {
      mounted = false;
    };
  }, [userId, officerId]);

  const saveDraft = async (step = currentStep, dataOverride?: OnboardingData) => {
    if (!loaded || !activeOfficerId) return false;
    setSaving(true);
    try {
      const draftData = dataOverride || data;
      const payload: any = {
        user_id: userId,
        officer_id: activeOfficerId,
        hiring_application_id: hiringApplicationId,
        company_name: draftData.employerName,
        status,
        current_step: step,
        form_data: draftData,
        signature_name: draftData.signatureName || null,
        signature_date: draftData.signatureDate || null,
        updated_at: new Date().toISOString(),
      };
      const currentId = packetIdRef.current;
      const result = currentId ? await (supabase as any).from("officer_onboarding_packets").update(payload).eq("id", currentId).select("id").single() : await (supabase as any).from("officer_onboarding_packets").insert(payload).select("id").single();
      if (result.error) throw result.error;
      if (result.data?.id) {
        packetIdRef.current = result.data.id;
        setPacketId(result.data.id);
      }
      setSaveError(null);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      return true;
    } catch (error: any) {
      console.error("Onboarding autosave failed", error);
      setSaveError(error.message || "Draft could not be saved");
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!loaded || !activeOfficerId || status === "submitted") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveDraft();
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data, currentStep, loaded, activeOfficerId, status]);

  useEffect(() => {
    if (![1, 2, 7].includes(currentStep)) return;
    const timer = setTimeout(async () => {
      try {
        const [i9Bytes, w4Bytes] = await Promise.all([buildI9(data, ssn), buildW4(data, ssn)]);
        const nextI9 = pdfUrl(i9Bytes);
        const nextW4 = pdfUrl(w4Bytes);
        setI9Url((previous) => {
          if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
          return nextI9;
        });
        setW4Url((previous) => {
          if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
          return nextW4;
        });
      } catch (error) {
        console.error("Official form preview failed", error);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [data, ssn, currentStep]);

  useEffect(() => {
    if (currentStep !== 3 || data.paymentMethod !== "direct_deposit" || bankAccounts.length === 0) return;
    const timer = setTimeout(async () => {
      try {
        const bytes = await buildDirectDeposit(data, bankAccounts, ssn);
        const nextUrl = pdfUrl(bytes);
        setDirectDepositUrl((previous) => {
          if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
          return nextUrl;
        });
      } catch (error) {
        console.error("Direct deposit form preview failed", error);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [data, bankAccounts, ssn, currentStep]);

  useEffect(() => {
    if (currentStep !== 5 || !activePolicyKey) return;
    const item = policyItems.find(([key]) => key === activePolicyKey);
    if (!item) return;
    const [key, title, path] = item;
    const acknowledgement = data.policyAcknowledgements[key] || {
      viewedAt: "",
      printedName: [data.legalFirstName, data.middleInitial, data.legalLastName].filter(Boolean).join(" "),
      employeeTitle: data.offeredPosition || "Security Officer",
      signatureDate: new Date().toISOString().slice(0, 10),
      signatureImage: "",
      accepted: false,
      notes: "",
      documentFields: {},
    };
    const timer = setTimeout(async () => {
      try {
        const result = await buildPolicyAcknowledgement(path, { title, ...acknowledgement }, data);
        const nextUrl = pdfUrl(result.bytes);
        setPolicyPreview((previous) => {
          if (previous?.url.startsWith("blob:")) URL.revokeObjectURL(previous.url);
          return { key, url: nextUrl, page: 1 };
        });
      } catch (error) {
        console.error("Company document preview failed", error);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [activePolicyKey, currentStep, data]);

  const policiesComplete = policyItems.every(([key]) => {
    const acknowledgement = data.policyAcknowledgements[key];
    return Boolean(data.policies[key] && acknowledgement?.viewedAt && acknowledgement.accepted && acknowledgement.printedName && acknowledgement.signatureDate && acknowledgement.signatureImage);
  });
  const i9AuthorizationComplete = data.citizenshipStatus !== "Authorized to work until a specified date" || Boolean(data.workAuthorizationExpiration && (data.alienNumber || data.i94Number || (data.foreignPassportNumber && data.passportCountry)));
  const bankAccountsComplete = savedBankAccounts.length > 0 || (bankAccounts.length > 0 && bankAccounts.every((account, index) => Boolean(
    account.bankName && account.bankCity && account.bankState && /^\d{9}$/.test(account.routingNumber.replace(/\D/g, "")) && /^\d{4,17}$/.test(account.accountNumber.replace(/\D/g, "")) && (index === bankAccounts.length - 1 ? account.allocationType === "entire" : account.allocationType === "amount" && Number(account.allocationAmount) > 0)
  )));
  const directDepositComplete = bankAccountsComplete && data.bankAuthorizationAccepted && Boolean(data.bankSignatureName && data.bankSignatureDate && data.bankSignatureImage);
  const completeStep = (step: number) => (step === 0 ? Boolean(hiringApplicationId) : step === 1 ? Boolean(data.legalFirstName && data.legalLastName && data.address && data.city && data.state && data.zip && data.dateOfBirth && data.email && data.phone && data.citizenshipStatus && (ssnMasked || isValidSsn(ssn)) && data.signatureImage && (data.citizenshipStatus !== "Lawful permanent resident" || data.alienNumber) && i9AuthorizationComplete) : step === 2 ? Boolean(data.filingStatus && data.w4SignatureName && data.w4SignatureDate && data.w4SignatureImage) : step === 3 ? data.paymentMethod === "paper_check" || directDepositComplete : step === 4 ? Boolean(data.emergencyName && data.emergencyRelationship && data.emergencyPhone) : step === 5 ? policiesComplete : step === 6 ? Boolean(data.startDate) : Boolean(data.signatureName && data.signatureDate && data.signatureImage));
  const allComplete = useMemo(() => Array.from({ length: 8 }, (_, index) => completeStep(index)).every(Boolean), [data, ssn, ssnMasked, bankAccounts, savedBankAccounts, hiringApplicationId]);

  const saveSensitiveForStep = async (step: number) => {
    if (step === 1 && ssn) {
      const result = await supabase.functions.invoke("manage-sensitive-data", {
        body: { action: "save_ssn", data: { ssn: formatSsn(ssn) } },
      });
      if (result.error || result.data?.error) throw new Error(await functionErrorMessage(result, "SSN could not be saved"));
      setSsnMasked(result.data.ssn_last_four);
    }
    if (step === 3 && data.paymentMethod === "direct_deposit" && bankAccounts.length) {
      const result = await supabase.functions.invoke("manage-sensitive-data", {
        body: {
          action: "save_bank_accounts",
          data: { accounts: bankAccounts.map(({ id: _id, ...account }) => ({ ...account, routingNumber: account.routingNumber.replace(/\D/g, ""), accountNumber: account.accountNumber.replace(/\D/g, "") })) },
        },
      });
      if (result.error || result.data?.error) throw new Error(await functionErrorMessage(result, "Bank information could not be saved"));
      setSavedBankAccounts(result.data.bank_accounts || []);
      setBankAccounts([]);
    }
  };

  const go = async (nextStep: number) => {
    const destination = Math.max(0, Math.min(7, nextStep));
    try {
      await saveSensitiveForStep(currentStep);
      if (!(await saveDraft(destination))) throw new Error("Your progress could not be saved");
      setCurrentStep(destination);
      requestAnimationFrame(() => document.getElementById("employee-onboarding-top")?.scrollIntoView({ behavior: "auto", block: "start" }));
    } catch (error: any) {
      toast.error(error.message || "Your progress could not be saved");
    }
  };

  const next = async () => {
    if (!completeStep(currentStep)) {
      if (currentStep === 1) {
        const missing = [["legal first name", data.legalFirstName], ["legal last name", data.legalLastName], ["street address", data.address], ["city", data.city], ["state", data.state], ["ZIP code", data.zip], ["date of birth", data.dateOfBirth], ["email", data.email], ["phone", data.phone], ["citizenship or immigration status", data.citizenshipStatus], ["Social Security number", ssnMasked || isValidSsn(ssn)], ["drawn I-9 signature", data.signatureImage], ...(data.citizenshipStatus === "Lawful permanent resident" ? [["USCIS or A-Number", data.alienNumber]] : []), ...(data.citizenshipStatus === "Authorized to work until a specified date" ? [["work authorization expiration date", data.workAuthorizationExpiration], ["USCIS/A-Number, I-94 number, or foreign passport details", data.alienNumber || data.i94Number || (data.foreignPassportNumber && data.passportCountry)]] : [])].filter(([, value]) => !value).map(([label]) => label);
        toast.error(missing.length === 1 ? `Add your ${missing[0]} before continuing` : `Complete: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}`);
      } else toast.error("Complete the required fields before continuing");
      return;
    }
    await go(currentStep + 1);
  };

  const submitI9 = async () => {
    if (!completeStep(1)) {
      toast.error("Complete every required I-9 field and signature before submitting");
      return;
    }
    if (!isValidSsn(ssn)) {
      toast.error("Re-enter your full Social Security number before submitting Form I-9");
      return;
    }
    setSubmittingI9(true);
    try {
      await saveSensitiveForStep(1);
      if (!(await saveDraft(1)) || !packetIdRef.current) throw new Error("The I-9 draft could not be saved");
      const i9Bytes = await buildI9(data, formatSsn(ssn));
      const i9Path = `${userId}/${packetIdRef.current}/form-i9.pdf`;
      const upload = await supabase.storage.from("onboarding-documents").upload(i9Path, new Blob([i9Bytes as unknown as BlobPart], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
      if (upload.error) throw upload.error;
      const submittedAt = new Date().toISOString();
      const { error } = await (supabase as any).from("officer_onboarding_packets").update({ i9_document_path: i9Path, i9_submitted_at: submittedAt, form_data: data, signature_name: data.signatureName || [data.legalFirstName, data.middleInitial, data.legalLastName].filter(Boolean).join(" "), signature_date: data.signatureDate, updated_at: submittedAt }).eq("id", packetIdRef.current);
      if (error) throw error;
      setI9SubmittedAt(submittedAt);
      toast.success(`Signed Form I-9 sent securely to ${data.employerName}`);
      onChanged?.();
    } catch (error: any) {
      toast.error(error.message || "Form I-9 could not be submitted");
    } finally {
      setSubmittingI9(false);
    }
  };

  const submitW4 = async () => {
    if (!completeStep(2)) {
      toast.error("Choose a filing status, sign Form W-4, and add the signature date before submitting");
      return;
    }
    if (!isValidSsn(ssn)) {
      toast.error("Re-enter your full Social Security number on the I-9 step before submitting Form W-4");
      return;
    }
    setSubmittingW4(true);
    try {
      await saveSensitiveForStep(1);
      if (!(await saveDraft(2)) || !packetIdRef.current) throw new Error("The W-4 draft could not be saved");
      const w4Bytes = await buildW4(data, formatSsn(ssn));
      const w4Path = `${userId}/${packetIdRef.current}/form-w4.pdf`;
      const upload = await supabase.storage.from("onboarding-documents").upload(w4Path, new Blob([w4Bytes as unknown as BlobPart], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
      if (upload.error) throw upload.error;
      const submittedAt = new Date().toISOString();
      const { error } = await (supabase as any).from("officer_onboarding_packets").update({ w4_document_path: w4Path, w4_submitted_at: submittedAt, form_data: data, updated_at: submittedAt }).eq("id", packetIdRef.current);
      if (error) throw error;
      setW4SubmittedAt(submittedAt);
      toast.success(`Signed Form W-4 sent securely to ${data.employerName}`);
      onChanged?.();
    } catch (error: any) {
      toast.error(error.message || "Form W-4 could not be submitted");
    } finally {
      setSubmittingW4(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!allComplete || !packetIdRef.current) {
      toast.error("Complete each required onboarding step before submitting");
      return;
    }
    if (!isValidSsn(ssn)) {
      toast.error("Re-enter your SSN on the I-9 step so the official I-9 and W-4 can be securely generated");
      setCurrentStep(1);
      return;
    }
    setSubmitting(true);
    try {
      await saveSensitiveForStep(currentStep);
      const normalizedSsn = formatSsn(ssn);
      const [i9Bytes, w4Bytes] = await Promise.all([buildI9(data, normalizedSsn), buildW4(data, normalizedSsn)]);
      const basePath = `${userId}/${packetIdRef.current}`;
      const i9Path = `${basePath}/form-i9.pdf`;
      const w4Path = `${basePath}/form-w4.pdf`;
      const [i9Upload, w4Upload] = await Promise.all([
        supabase.storage.from("onboarding-documents").upload(i9Path, new Blob([i9Bytes as unknown as BlobPart], { type: "application/pdf" }), {
          upsert: true,
          contentType: "application/pdf",
        }),
        supabase.storage.from("onboarding-documents").upload(w4Path, new Blob([w4Bytes as unknown as BlobPart], { type: "application/pdf" }), {
          upsert: true,
          contentType: "application/pdf",
        }),
      ]);
      if (i9Upload.error) throw i9Upload.error;
      if (w4Upload.error) throw w4Upload.error;
      const submittedAt = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("officer_onboarding_packets")
        .update({
          status: "submitted",
          current_step: 7,
          form_data: data,
          signature_name: data.signatureName,
          signature_date: data.signatureDate,
          i9_document_path: i9Path,
          w4_document_path: w4Path,
          i9_submitted_at: i9SubmittedAt || submittedAt,
          w4_submitted_at: w4SubmittedAt || submittedAt,
          submitted_at: submittedAt,
          updated_at: submittedAt,
        })
        .eq("id", packetIdRef.current);
      if (error) throw error;
      setStatus("submitted");
      toast.success("Employee onboarding packet submitted");
      onChanged?.();
    } catch (error: any) {
      toast.error(error.message || "Onboarding could not be submitted");
    } finally {
      setSubmitting(false);
    }
  };

  const progress = Math.round(((currentStep + 1) / steps.length) * 100);
  const completedPolicyCount = policyItems.filter(([key]) => {
    const acknowledgement = data.policyAcknowledgements[key];
    return Boolean(data.policies[key] && acknowledgement?.viewedAt && acknowledgement.accepted && acknowledgement.printedName && acknowledgement.signatureDate && acknowledgement.signatureImage);
  }).length;
  const openPolicy = (key: string) => {
    setActivePolicyKey((current) => current === key ? null : key);
    setData((current) => current.policyAcknowledgements[key] ? current : {
      ...current,
      policyAcknowledgements: {
        ...current.policyAcknowledgements,
        [key]: {
          viewedAt: "",
          printedName: [current.legalFirstName, current.middleInitial, current.legalLastName].filter(Boolean).join(" "),
          employeeTitle: current.offeredPosition || "Security Officer",
          signatureDate: new Date().toISOString().slice(0, 10),
          signatureImage: "",
          accepted: false,
          notes: "",
          documentFields: {},
        },
      },
    });
  };
  const updatePolicyAcknowledgement = (key: string, changes: Partial<PolicyAcknowledgement>) => {
    setPolicyPreview((current) => {
      if (current?.key !== key) return current;
      if (current.url.startsWith("blob:")) URL.revokeObjectURL(current.url);
      return null;
    });
    setData((current) => ({
      ...current,
      policies: { ...current.policies, [key]: false },
      policyAcknowledgements: {
        ...current.policyAcknowledgements,
        [key]: { ...current.policyAcknowledgements[key], ...changes },
      },
    }));
  };
  const savePolicyAcknowledgement = async (key: string) => {
    const acknowledgement = data.policyAcknowledgements[key];
    if (!acknowledgement?.viewedAt) {
      toast.error("Open and review the document before signing and saving it");
      return;
    }
    if (!acknowledgement?.accepted || !acknowledgement.printedName || !acknowledgement.signatureDate || !acknowledgement.signatureImage) {
      toast.error("Accept the document, add your name and date, and sign before saving");
      return;
    }
    if (policyPreview?.key !== key) {
      toast.error("Wait for the updated PDF preview to finish, then save the document");
      return;
    }
    const nextData = { ...data, policies: { ...data.policies, [key]: true } };
    setData(nextData);
    const saved = await saveDraft(currentStep, nextData);
    if (!saved) {
      setData((current) => ({ ...current, policies: { ...current.policies, [key]: false } }));
      toast.error("The document could not be saved. Please try again.");
      return;
    }
    setActivePolicyKey(null);
    toast.success("Document verified, saved, and marked complete");
    const currentIndex = policyItems.findIndex(([k]) => k === key);
    const nextItem = policyItems[currentIndex + 1];
    if (nextItem) {
      const nextKey = nextItem[0];
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(`policy-${nextKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }
  };
  if (!loaded)
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-8 text-center text-muted-foreground">Loading employee onboarding…</CardContent>
      </Card>
    );

  return (
    <form id="employee-onboarding-top" onSubmit={submit} className="mx-auto w-full max-w-6xl scroll-mt-4 pb-24 lg:pb-8">
      <div className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="flex items-center gap-3 px-5 py-5 sm:px-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">We Find Guards</p>
            <h1 className="text-xl font-bold sm:text-2xl">Employee Onboarding</h1>
            <p className="mt-1 text-sm text-muted-foreground">Complete your hiring paperwork in the app. Your progress saves automatically.</p>
            {saveError && <p className="mt-2 text-sm font-semibold text-destructive">Draft not saved. Please try again.</p>}
          </div>
          <span className={`hidden items-center gap-1 text-xs sm:flex ${saveError ? "text-destructive" : "text-muted-foreground"}`}>
            <Cloud className="h-4 w-4" />
            {saveError ? "Save failed" : saving ? "Saving…" : savedAt ? `Saved ${savedAt}` : "Autosave on"}
          </span>
        </div>
        <div className="h-2 bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {status === "submitted" && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-800">
          <CheckCircle2 className="h-5 w-5" />
          <div>
            <p className="font-semibold">Onboarding submitted</p>
            <p className="text-sm">Your completed packet is available to {data.employerName}.</p>
          </div>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-4 space-y-1 rounded-2xl border bg-card p-3">
            {steps.map((step, index) => (
              <button key={step[0]} type="button" onClick={() => go(index)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${index === currentStep ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index === currentStep ? "bg-white/20" : completeStep(index) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{completeStep(index) && index !== currentStep ? <Check className="h-4 w-4" /> : index + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{step[0]}</span>
                  <span className={`block truncate text-xs ${index === currentStep ? "text-white/75" : "text-muted-foreground"}`}>{step[1]}</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">
          <div className="mb-4 flex justify-between lg:hidden">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">Step {currentStep + 1} of 8</span>
            <span className="text-sm text-muted-foreground">{progress}% complete</span>
          </div>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="border-b px-5 py-6 sm:px-8">
              <CardTitle className="text-2xl sm:text-3xl">{steps[currentStep][0]}</CardTitle>
              <CardDescription className="text-base">{steps[currentStep][1]}</CardDescription>
            </CardHeader>
            <CardContent className="px-5 py-7 sm:px-8 sm:py-9">
              {currentStep === 0 && (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Onboarding destination</p>
                    <h2 className="mt-2 text-2xl font-bold">{data.employerName}</h2>
                    <p className="mt-2 text-muted-foreground">This employee packet follows your submitted hiring application. We Find Guards securely saves your forms and sends the completed packet to this employer.</p>
                  </div>
                  {!hiringApplicationId && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Submit a hiring application to a company before beginning employee onboarding.</div>}
                  <div className="flex items-start gap-3 rounded-xl border p-4">
                    <LockKeyhole className="mt-0.5 h-5 w-5 text-primary" />
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">Sensitive information is encrypted.</strong> SSN and bank numbers are not stored in the ordinary onboarding draft or displayed back in full.
                    </p>
                  </div>
                  <OfficialDocument title="Employee onboarding packet checklist" url="/forms/00-kairos-security-checklist-for-employee-folders.pdf" />
                </div>
              )}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="rounded-xl bg-primary/5 p-4 text-sm">
                    <strong>Official USCIS Form I-9 — Section 1.</strong> This is the actual government document. Complete the guided fields below and the official form preview updates in place. Your employer completes Section 2.
                  </div>
                  <OfficialDocument title="Official Form I-9" url={i9Url} />
                  <div className="grid gap-5 md:grid-cols-3">
                    <Field label="Legal first name" value={data.legalFirstName} onChange={(v) => update("legalFirstName", v)} required />
                    <Field label="Middle initial" value={data.middleInitial} onChange={(v) => update("middleInitial", v)} />
                    <Field label="Legal last name" value={data.legalLastName} onChange={(v) => update("legalLastName", v)} required />
                    <div className="md:col-span-3">
                      <Field label="Other last names used" value={data.otherLastNames} onChange={(v) => update("otherLastNames", v)} />
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Street address" value={data.address} onChange={(v) => update("address", v)} required />
                    </div>
                    <Field label="Apartment number" value={data.apartmentNumber} onChange={(v) => update("apartmentNumber", v)} />
                    <Field label="City" value={data.city} onChange={(v) => update("city", v)} required />
                    <Field label="State" value={data.state} onChange={(v) => update("state", v)} required />
                    <Field label="ZIP code" value={data.zip} onChange={(v) => update("zip", v)} required />
                    <Field label="Date of birth" type="date" value={data.dateOfBirth} onChange={(v) => update("dateOfBirth", v)} required />
                    <Field label="Email" type="email" value={data.email} onChange={(v) => update("email", v)} required />
                    <Field label="Phone" type="tel" value={data.phone} onChange={(v) => update("phone", v)} required />
                  </div>
                  <div className="rounded-xl border p-4">
                    <div className="space-y-2">
                      <Label htmlFor="employee-onboarding-ssn">{ssnMasked ? `Social Security number (encrypted copy saved as ${ssnMasked})` : "Social Security number"} *</Label>
                      <div className="relative">
                        <Input id="employee-onboarding-ssn" className="h-12 pr-12 font-mono text-base tracking-wider" inputMode="numeric" autoComplete="off" maxLength={11} value={showSsn ? formatSsn(ssn) : maskSsn(ssn)} onChange={(event) => handleSsnChange(event.target.value)} placeholder="XXX-XX-XXXX" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-10 w-10" onClick={() => setShowSsn((visible) => !visible)} aria-label={showSsn ? "Hide Social Security number" : "Show Social Security number"}>{showSsn ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</Button>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Your full number stays only in this active form session and is separately encrypted when saved.</p>
                  </div>
                  <Choice label="Citizenship or immigration status" value={data.citizenshipStatus} onChange={(v) => update("citizenshipStatus", v)} options={["U.S. citizen", "Noncitizen national", "Lawful permanent resident", "Authorized to work until a specified date"]} />
                  {data.citizenshipStatus === "Lawful permanent resident" && <Field label="USCIS or A-Number" value={data.alienNumber} onChange={(v) => update("alienNumber", v)} required />}
                  {data.citizenshipStatus === "Authorized to work until a specified date" && (
                    <div className="grid gap-5 md:grid-cols-2">
                      <Field label="Work authorization expiration" type="date" value={data.workAuthorizationExpiration} onChange={(v) => update("workAuthorizationExpiration", v)} required />
                      <Field label="USCIS / A-Number" value={data.alienNumber} onChange={(v) => update("alienNumber", v)} />
                      <Field label="Form I-94 number" value={data.i94Number} onChange={(v) => update("i94Number", v)} />
                      <Field label="Foreign passport number" value={data.foreignPassportNumber} onChange={(v) => update("foreignPassportNumber", v)} />
                      <Field label="Country of issuance" value={data.passportCountry} onChange={(v) => update("passportCountry", v)} />
                    </div>
                  )}
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-6">
                    <div className="mb-5">
                      <h3 className="font-semibold">Employee signature for Form I-9</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Sign with your finger, mouse, or stylus. Your signature is placed on the official I-9 and carried into your onboarding packet. You can review or redraw it before final submission.</p>
                    </div>
                    <SignaturePad value={data.signatureImage} suggestedName={[data.legalFirstName, data.middleInitial, data.legalLastName].filter(Boolean).join(" ")} onChange={(value) => update("signatureImage", value)} />
                  </div>
                  <div className={`rounded-2xl border p-5 ${i9SubmittedAt ? "border-green-200 bg-green-50" : "border-primary/30 bg-card"}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">{i9SubmittedAt ? "Form I-9 submitted" : `Send Form I-9 to ${data.employerName}`}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{i9SubmittedAt ? `Securely sent ${new Date(i9SubmittedAt).toLocaleString()}. You can update and resubmit it if needed.` : "This submits only your signed I-9. You can continue the remaining onboarding steps afterward."}</p>
                      </div>
                      <Button type="button" size="lg" onClick={submitI9} disabled={submittingI9 || saving} className="shrink-0"><FileCheck2 className="mr-2 h-5 w-5" />{submittingI9 ? "Submitting I-9…" : i9SubmittedAt ? "Update submitted I-9" : "Submit Form I-9"}</Button>
                    </div>
                  </div>
                </div>
              )}
              {currentStep === 2 && (
                <div className="space-y-7">
                  <div className="rounded-xl bg-primary/5 p-4 text-sm">
                    <strong>Official IRS Form W-4 — Employee’s Withholding Certificate.</strong> The actual government form appears below and updates from the answers you enter in We Find Guards.
                  </div>
                  <OfficialDocument title="Official Form W-4" url={w4Url} />
                  <Choice label="Federal filing status" value={data.filingStatus} onChange={(v) => update("filingStatus", v)} options={["Single or Married filing separately", "Married filing jointly or Qualifying surviving spouse", "Head of household"]} />
                  <label className="flex items-start gap-3 rounded-xl border p-4">
                    <Checkbox checked={data.multipleJobs} onCheckedChange={(value) => update("multipleJobs", Boolean(value))} />
                    <span>
                      <span className="block font-medium">Multiple jobs or spouse works</span>
                      <span className="text-sm text-muted-foreground">Use this if there are only two jobs total or complete the IRS multiple-jobs calculation.</span>
                    </span>
                  </label>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Qualifying children under 17" type="number" value={data.qualifyingChildren} onChange={(v) => update("qualifyingChildren", v)} />
                    <Field label="Other dependents" type="number" value={data.otherDependents} onChange={(v) => update("otherDependents", v)} />
                    <Field label="Other credits" type="number" value={data.otherCredits} onChange={(v) => update("otherCredits", v)} />
                    <Field label="Other income" type="number" value={data.otherIncome} onChange={(v) => update("otherIncome", v)} />
                    <Field label="Deductions" type="number" value={data.deductions} onChange={(v) => update("deductions", v)} />
                    <Field label="Extra withholding each pay period" type="number" value={data.extraWithholding} onChange={(v) => update("extraWithholding", v)} />
                  </div>
                  <label className="flex items-start gap-3 rounded-xl border p-4">
                    <Checkbox checked={data.exemptFromWithholding} onCheckedChange={(value) => update("exemptFromWithholding", Boolean(value))} />
                    <span><span className="block font-medium">I claim exemption from withholding for 2026</span><span className="text-sm text-muted-foreground">Select this only if you meet both IRS exemption conditions described in the official instructions.</span></span>
                  </label>
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-6">
                    <div className="mb-5">
                      <h3 className="font-semibold">Employee signature for Form W-4</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Sign this W-4 separately. Your signature and date are placed on the official Step 5 signature lines.</p>
                    </div>
                    <div className="mb-5 grid gap-5 md:grid-cols-2">
                      <Field label="W-4 full legal name" value={data.w4SignatureName} onChange={(v) => update("w4SignatureName", v)} required />
                      <Field label="W-4 signature date" type="date" value={data.w4SignatureDate} onChange={(v) => update("w4SignatureDate", v)} required />
                    </div>
                    <SignaturePad value={data.w4SignatureImage} suggestedName={data.w4SignatureName || [data.legalFirstName, data.middleInitial, data.legalLastName].filter(Boolean).join(" ")} onChange={(value) => update("w4SignatureImage", value)} />
                  </div>
                  <div className={`rounded-2xl border p-5 ${w4SubmittedAt ? "border-green-200 bg-green-50" : "border-primary/30 bg-card"}`}>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">{w4SubmittedAt ? "Form W-4 submitted" : `Send Form W-4 to ${data.employerName}`}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{w4SubmittedAt ? `Securely sent ${new Date(w4SubmittedAt).toLocaleString()}. You can update and resubmit it if needed.` : "This submits only your signed W-4. You can continue the remaining onboarding steps afterward."}</p>
                      </div>
                      <Button type="button" size="lg" onClick={submitW4} disabled={submittingW4 || saving} className="shrink-0"><FileCheck2 className="mr-2 h-5 w-5" />{submittingW4 ? "Submitting W-4…" : w4SubmittedAt ? "Update submitted W-4" : "Submit Form W-4"}</Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">We Find Guards does not provide tax advice. If you are unsure what to enter, consult the official IRS instructions or a tax professional.</p>
                </div>
              )}
              {currentStep === 3 && (
                <div className="space-y-7">
                  <OfficialDocument title="Direct deposit authorization form" url={directDepositUrl} autoFilled initialPage={2} />
                  <Choice
                    label="How would you like to be paid?"
                    value={data.paymentMethod}
                    onChange={(v) => update("paymentMethod", v)}
                    options={["direct_deposit", "paper_check"]}
                    optionLabels={{ direct_deposit: "Direct deposit", paper_check: "Paper check" }}
                  />
                  {data.paymentMethod === "direct_deposit" && (
                    <div className="space-y-5 rounded-2xl border p-5">
                      <div className="flex items-center gap-2">
                        <LockKeyhole className="h-5 w-5 text-primary" />
                        <div>
                          <h3 className="font-semibold">Encrypted direct deposit accounts</h3>
                          <p className="mt-1 text-sm text-muted-foreground">Add up to three accounts, as allowed on the official form. The final account receives the remaining net pay.</p>
                        </div>
                      </div>
                      {savedBankAccounts.length > 0 && (
                        <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4">
                          <p className="font-semibold text-green-900">{savedBankAccounts.length} bank {savedBankAccounts.length === 1 ? "account" : "accounts"} saved securely</p>
                          {savedBankAccounts.map((account, index) => (
                            <div key={`${account.accountLastFour}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm text-green-900">
                              <span><strong>Account {index + 1}:</strong> {account.bankName} {account.bankCity && `- ${account.bankCity}, ${account.bankState}`}</span>
                              <span className="font-mono">{account.accountType} {account.accountLastFour}</span>
                            </div>
                          ))}
                          <Button type="button" variant="outline" size="sm" onClick={() => { setSavedBankAccounts([]); setBankAccounts([newBankAccount("entire", "bank-1")]); }}>Replace bank accounts</Button>
                        </div>
                      )}
                      {bankAccounts.map((account, index) => (
                        <div key={account.id} className="space-y-5 rounded-2xl border bg-muted/20 p-4 sm:p-5">
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="font-semibold">Bank account {index + 1}</h4>
                            {bankAccounts.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => removeBankAccount(account.id)} className="text-destructive hover:text-destructive"><Trash2 className="mr-1 h-4 w-4" />Remove</Button>}
                          </div>
                          <div className="grid gap-5 md:grid-cols-2">
                            <Field label="Bank name" value={account.bankName} onChange={(v) => updateBankAccount(account.id, "bankName", v)} required />
                            <Choice label="Account type" value={account.accountType} onChange={(v) => updateBankAccount(account.id, "accountType", v as BankAccountDraft["accountType"])} options={["checking", "savings", "other"]} optionLabels={{ checking: "Checking", savings: "Savings", other: "Other" }} stacked />
                            <Field label="Bank city" value={account.bankCity} onChange={(v) => updateBankAccount(account.id, "bankCity", v)} required />
                            <Field label="Bank state" value={account.bankState} onChange={(v) => updateBankAccount(account.id, "bankState", v)} required />
                            <Field label="9-digit routing number" value={account.routingNumber} onChange={(v) => updateBankAccount(account.id, "routingNumber", v.replace(/\D/g, "").slice(0, 9))} required />
                            <Field label="Account number" value={account.accountNumber} onChange={(v) => updateBankAccount(account.id, "accountNumber", v.replace(/\D/g, "").slice(0, 17))} required />
                            {index < bankAccounts.length - 1 ? (
                              <Field label="Amount to deposit each payday" type="number" value={account.allocationAmount} onChange={(v) => updateBankAccount(account.id, "allocationAmount", v)} required />
                            ) : (
                              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
                                <p className="font-semibold text-primary">Entire remaining net amount</p>
                                <p className="mt-1 text-muted-foreground">The official form requires the last account to receive the remaining pay.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {bankAccounts.length > 0 && bankAccounts.length < 3 && <Button type="button" variant="outline" onClick={addBankAccount}><Plus className="mr-2 h-4 w-4" />Add another bank account</Button>}
                      <div className="space-y-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-6">
                        <div>
                          <h3 className="font-semibold">Direct deposit authorization and signature</h3>
                          <p className="mt-1 text-sm text-muted-foreground">This signature applies only to your direct deposit enrollment form.</p>
                        </div>
                        <label className="flex items-start gap-3 rounded-xl border bg-background p-4">
                          <Checkbox checked={data.bankAuthorizationAccepted} onCheckedChange={(value) => update("bankAuthorizationAccepted", Boolean(value))} />
                          <span className="text-sm">I authorize my employer and its payroll provider to deposit pay into the accounts listed above and to correct an erroneous deposit up to the original amount.</span>
                        </label>
                        <div className="grid gap-5 md:grid-cols-2">
                          <Field label="Full legal name for direct deposit" value={data.bankSignatureName} onChange={(v) => update("bankSignatureName", v)} required />
                          <Field label="Direct deposit signature date" type="date" value={data.bankSignatureDate} onChange={(v) => update("bankSignatureDate", v)} required />
                        </div>
                        <SignaturePad value={data.bankSignatureImage} suggestedName={data.bankSignatureName || [data.legalFirstName, data.middleInitial, data.legalLastName].filter(Boolean).join(" ")} onChange={(value) => update("bankSignatureImage", value)} />
                      </div>
                    </div>
                  )}
                </div>
              )}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <OfficialDocument title="Emergency contact form" url="/forms/05-emergency-contact-form-fill.pdf" />
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Emergency contact name" value={data.emergencyName} onChange={(v) => update("emergencyName", v)} required />
                    <Field label="Relationship" value={data.emergencyRelationship} onChange={(v) => update("emergencyRelationship", v)} required />
                    <Field label="Primary phone" type="tel" value={data.emergencyPhone} onChange={(v) => update("emergencyPhone", v)} required />
                    <Field label="Alternate phone" type="tel" value={data.emergencyAltPhone} onChange={(v) => update("emergencyAltPhone", v)} />
                    <Field label="Physician name" value={data.physicianName} onChange={(v) => update("physicianName", v)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Medical or emergency instructions</Label>
                    <Textarea rows={4} value={data.medicalNotes} onChange={(event) => update("medicalNotes", event.target.value)} />
                  </div>
                </div>
              )}
              {currentStep === 5 && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">How company documents work</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-background p-4"><strong className="block">1. Fill it out</strong><span className="text-sm text-muted-foreground">Add your name, date, acknowledgment, and signature.</span></div>
                      <div className="rounded-xl bg-background p-4"><strong className="block">2. See it update</strong><span className="text-sm text-muted-foreground">The PDF preview changes automatically as you type.</span></div>
                      <div className="rounded-xl bg-background p-4"><strong className="block">3. Save it</strong><span className="text-sm text-muted-foreground">Save the signed document to complete it.</span></div>
                    </div>
                    <p className="mt-4 text-sm font-medium">{completedPolicyCount} of {policyItems.length} documents completed</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round((completedPolicyCount / policyItems.length) * 100)}%` }} /></div>
                  </div>
                  <div className="grid gap-5 rounded-2xl border p-5 md:grid-cols-2">
                    <Field label="Offered position" value={data.offeredPosition} onChange={(v) => update("offeredPosition", v)} required />
                    <Field label="Hourly rate" type="number" value={data.hourlyRate} onChange={(v) => update("hourlyRate", v)} />
                    <Field label="TrackTik username" value={data.trackTikUsername} onChange={(v) => update("trackTikUsername", v)} />
                    <label className="flex items-center gap-3 self-end rounded-xl border p-4">
                      <Checkbox checked={data.trackTikPasswordSet} onCheckedChange={(v) => update("trackTikPasswordSet", Boolean(v))} />
                      <span className="text-sm font-medium">TrackTik password set</span>
                    </label>
                  </div>
                  {policyItems.map(([key, label, document], index) => {
                    const acknowledgement = data.policyAcknowledgements[key];
                    const expanded = activePolicyKey === key;
                    const viewed = Boolean(acknowledgement?.viewedAt);
                    const completed = Boolean(data.policies[key] && viewed && acknowledgement?.accepted && acknowledgement.printedName && acknowledgement.signatureDate && acknowledgement.signatureImage);
                    return (
                      <div key={key} className={`overflow-hidden rounded-2xl border-2 transition-colors ${completed ? "border-green-500 bg-green-50 shadow-sm" : expanded ? "border-primary/40 bg-background" : "border-border bg-background"}`}>
                        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${completed ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}>{completed ? <Check className="h-5 w-5" /> : index + 1}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2"><p className={`font-semibold ${completed ? "text-green-900" : ""}`}>{label}</p>{completed && <span className="rounded-full bg-green-600 px-2.5 py-1 text-xs font-semibold text-white">Completed</span>}</div>
                            <p className="text-sm text-muted-foreground">{completed ? "Verified, signed, and saved." : expanded ? "Complete the fields and preview directly below." : "Fill out, preview, sign, and save this document."}</p>
                          </div>
                          <Button type="button" variant={completed || expanded ? "outline" : "default"} size="sm" onClick={() => openPolicy(key)}>
                            {expanded ? <><ChevronUp className="mr-2 h-4 w-4" />Close</> : completed ? <><ChevronDown className="mr-2 h-4 w-4" />Edit & preview</> : <><ChevronDown className="mr-2 h-4 w-4" />Fill out</>}
                          </Button>
                        </div>
                        {expanded && acknowledgement && (
                          <div className="space-y-6 border-t bg-background p-4 sm:p-6">
                            <div className={`rounded-xl border p-4 text-sm ${viewed ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                              <strong>{viewed ? "Document viewed." : "Step 1: View the document."}</strong> {viewed ? "You may now complete the acknowledgment and signature below." : "Open the document preview before the acknowledgment and signature are unlocked."}
                            </div>
                            <OfficialDocument title={label} url={policyPreview?.key === key ? policyPreview.url : document} autoFilled initialPage={policyPreview?.key === key ? policyPreview.page : 1} viewed={viewed} onViewed={() => {
                              if (!acknowledgement.viewedAt) updatePolicyAcknowledgement(key, { viewedAt: new Date().toISOString() });
                            }} />
                            {viewed && (
                              <div className="space-y-6">
                                <div className="rounded-xl bg-primary/5 p-4 text-sm"><strong>Step 2: Complete and sign.</strong> Existing profile information is added automatically, and the preview refreshes inside this same card.</div>
                                <div className="grid gap-5 md:grid-cols-2">
                                  <Field label="Employee legal name" value={acknowledgement.printedName} onChange={(value) => updatePolicyAcknowledgement(key, { printedName: value })} required />
                                  <Field label="Position or title" value={acknowledgement.employeeTitle} onChange={(value) => updatePolicyAcknowledgement(key, { employeeTitle: value })} required />
                                  <Field label="Date signed" type="date" value={acknowledgement.signatureDate} onChange={(value) => updatePolicyAcknowledgement(key, { signatureDate: value })} required />
                                  <div className="space-y-2"><Label>Notes for this document</Label><Textarea rows={3} value={acknowledgement.notes} onChange={(event) => updatePolicyAcknowledgement(key, { notes: event.target.value })} placeholder="Optional" /></div>
                                </div>
                                {key === "property" && (
                                  <PropertyDocumentFields acknowledgement={acknowledgement} data={data} onChange={(field, value) => updatePolicyAcknowledgement(key, { documentFields: { ...acknowledgement.documentFields, [field]: value } })} />
                                )}
                                <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
                                  <Checkbox checked={acknowledgement.accepted} onCheckedChange={(value) => updatePolicyAcknowledgement(key, { accepted: Boolean(value) })} />
                                  <span className="text-sm"><strong className="block">I have reviewed and accept this document.</strong>I received the complete document and agree to the policies and responsibilities that apply to my employment.</span>
                                </label>
                                <SignaturePad value={acknowledgement.signatureImage} suggestedName={acknowledgement.printedName} onChange={(value) => updatePolicyAcknowledgement(key, { signatureImage: value })} />
                                <div className={`rounded-xl border p-4 text-sm ${policyPreview?.key === key ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                                  <strong>{policyPreview?.key === key ? "Preview verified:" : "Updating preview:"}</strong> {policyPreview?.key === key ? "the PDF contains your latest information and signature." : "wait a moment for your latest changes to appear before saving."}
                                </div>
                                <Button type="button" size="lg" className="w-full" disabled={policyPreview?.key !== key} onClick={() => savePolicyAcknowledgement(key)}><FileCheck2 className="mr-2 h-5 w-5" />{completed ? "Update saved document" : "Verify and save document"}</Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {currentStep === 6 && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold">Company property and uniform checklist</h3>
                    <p className="text-sm text-muted-foreground">Check only the items your employer has issued to you.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {issuedItemOptions.map((item) => (
                      <label key={item} className="flex items-center gap-3 rounded-xl border p-4">
                        <Checkbox checked={Boolean(data.issuedItems[item])} onCheckedChange={(v) => update("issuedItems", { ...data.issuedItems, [item]: Boolean(v) })} />
                        <span className="text-sm font-medium">{item}</span>
                      </label>
                    ))}
                  </div>
                  <div className="grid gap-5 border-t pt-6 md:grid-cols-4">
                    <Field label="Employee ID number" value={data.employeeIdNumber} onChange={(v) => update("employeeIdNumber", v)} />
                    <Field label="Shirt size" value={data.uniformShirt} onChange={(v) => update("uniformShirt", v)} />
                    <Field label="Pants size" value={data.uniformPants} onChange={(v) => update("uniformPants", v)} />
                    <Field label="Shoe size" value={data.uniformShoes} onChange={(v) => update("uniformShoes", v)} />
                  </div>
                  <div className="border-t pt-6">
                    <h3 className="mb-4 text-lg font-semibold">Assignment and schedule</h3>
                    <div className="grid gap-5 md:grid-cols-2">
                      <Field label="Post or assignment" value={data.scheduledPost} onChange={(v) => update("scheduledPost", v)} />
                      <Field label="Expected shift" value={data.scheduledShift} onChange={(v) => update("scheduledShift", v)} />
                      <Field label="Employment start date" type="date" value={data.startDate} onChange={(v) => update("startDate", v)} required />
                    </div>
                  </div>
                </div>
              )}
              {currentStep === 7 && (
                <div className="space-y-7">
                  <div className="rounded-2xl border bg-muted/30 p-5">
                    <h3 className="font-semibold">Packet review</h3>
                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      {steps.slice(1, 7).map((step, index) => (
                        <div key={step[0]} className="flex items-center gap-2">
                          {completeStep(index + 1) ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <span className="h-4 w-4 rounded-full border" />} {step[0]}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl bg-primary/5 p-4 text-sm">By signing, I certify that the information I entered is true and complete, that I completed the employee portions of the government forms, and that my electronic signature has the same effect as a handwritten signature.</div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Full legal name as signature" value={data.signatureName} onChange={(v) => update("signatureName", v)} required />
                    <Field label="Date signed" type="date" value={data.signatureDate} onChange={(v) => update("signatureDate", v)} required />
                  </div>
                  <SignaturePad value={data.signatureImage} suggestedName={data.signatureName || [data.legalFirstName, data.middleInitial, data.legalLastName].filter(Boolean).join(" ")} onChange={(value) => update("signatureImage", value)} />
                </div>
              )}
            </CardContent>
          </Card>
          <div className="mt-5 hidden items-center justify-between lg:flex">
            <Button type="button" variant="outline" onClick={() => go(currentStep - 1)} disabled={!currentStep}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            {currentStep < 7 ? (
              <Button type="button" onClick={next} disabled={saving}>
                Save and continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={submitting || !allComplete || status === "submitted"}>
                <FileCheck2 className="mr-2 h-4 w-4" />
                {status === "submitted" ? "Submitted" : submitting ? "Submitting…" : "Submit onboarding"}
              </Button>
            )}
          </div>
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t bg-background/95 p-3 shadow-xl backdrop-blur lg:hidden">
        <Button type="button" variant="outline" size="lg" onClick={() => go(currentStep - 1)} disabled={!currentStep}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {currentStep < 7 ? (
          <Button type="button" size="lg" className="flex-1" onClick={next} disabled={saving}>
            Save and continue
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        ) : (
          <Button type="submit" size="lg" className="flex-1" disabled={submitting || !allComplete || status === "submitted"}>
            <FileCheck2 className="mr-2 h-5 w-5" />
            {status === "submitted" ? "Submitted" : "Submit onboarding"}
          </Button>
        )}
      </div>
    </form>
  );
}

function PropertyDocumentFields({ acknowledgement, data, onChange }: { acknowledgement: PolicyAcknowledgement; data: OnboardingData; onChange: (field: string, value: string) => void }) {
  const fields = acknowledgement.documentFields || {};
  const value = (field: string) => fields[field] || "";

  return (
    <section className="space-y-5 rounded-2xl border bg-muted/10 p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Company property receipt</p>
        <h4 className="mt-1 text-lg font-semibold">Enter the information shown on the PDF</h4>
        <p className="mt-1 text-sm text-muted-foreground">Your name, employee ID, and hire date are filled from onboarding. Add only property actually issued to you. Return information can be completed later when an item is returned.</p>
      </div>
      <div className="grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Employee name</p><p className="font-medium">{acknowledgement.printedName || "Not entered"}</p></div>
        <div><p className="text-xs text-muted-foreground">Date of hire</p><p className="font-medium">{data.startDate || acknowledgement.signatureDate || "Not entered"}</p></div>
        <div><p className="text-xs text-muted-foreground">Employee ID</p><p className="font-medium">{data.employeeIdNumber || "Not assigned"}</p></div>
        <Field label="Department" value={value("Text4") || "Security"} onChange={(next) => onChange("Text4", next)} />
      </div>
      <div className="space-y-4">
        {propertyEquipmentRows.map(([pdfName, label]) => (
          <div key={pdfName} className="rounded-xl border bg-background p-4">
            <p className="mb-3 font-semibold">{label}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Quantity received" type="number" value={value(`Qty${pdfName}`)} onChange={(next) => onChange(`Qty${pdfName}`, next)} placeholder="0" />
              <Field label="Number, ID, or details" value={value(`Number or ID${pdfName}`)} onChange={(next) => onChange(`Number or ID${pdfName}`, next)} placeholder="Optional identifier" />
              <Field label="Returned to" value={value(`Returned To${pdfName}`)} onChange={(next) => onChange(`Returned To${pdfName}`, next)} placeholder="Complete when returned" />
              <Field label="Return date" type="date" value={value(`Date${pdfName}`)} onChange={(next) => onChange(`Date${pdfName}`, next)} />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {propertyAdditionalRows.map(([pdfName, label]) => (
          <Field key={pdfName} label={label} value={value(pdfName)} onChange={(next) => onChange(pdfName, next)} placeholder="Quantity or details, if issued" />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">The company representative signature remains for the employer to complete.</p>
    </section>
  );
}

function SignaturePad({ value, suggestedName, onChange }: { value: string; suggestedName: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!value) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = value;
  }, [value]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.strokeStyle = "#111827";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.lineJoin = "round";
  };
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = canvasRef.current!.getContext("2d")!;
    const position = point(event);
    context.lineTo(position.x, position.y);
    context.stroke();
  };
  const finish = () => {
    if (!drawingRef.current || !canvasRef.current) return;
    drawingRef.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    onChange("");
  };
  const createFromName = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !suggestedName.trim()) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111827";
    context.textAlign = "center";
    context.textBaseline = "middle";
    let size = 96;
    do {
      context.font = `italic ${size}px "Brush Script MT", "Snell Roundhand", "Segoe Script", cursive`;
      if (context.measureText(suggestedName).width <= canvas.width - 100) break;
      size -= 4;
    } while (size > 42);
    context.fillText(suggestedName, canvas.width / 2, canvas.height / 2 + 6);
    onChange(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Label>Your signature *</Label>
          <p className="mt-1 text-sm text-muted-foreground">Draw it below or create a written signature from your legal name.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={createFromName} disabled={!suggestedName.trim()}>Create signature from my name</Button>
          <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!value}>Clear</Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border-2 border-dashed bg-white shadow-inner">
        <canvas ref={canvasRef} width={900} height={240} aria-label="Draw your signature" className="h-40 w-full cursor-crosshair touch-none sm:h-44" onPointerDown={start} onPointerMove={draw} onPointerUp={finish} onPointerCancel={finish} onPointerLeave={finish} />
      </div>
      {value && (
        <p className="flex items-center gap-2 text-sm font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          Signature captured and included on your official forms.
        </p>
      )}
    </div>
  );
}

function OfficialDocument({ title, url, autoFilled = false, initialPage = 1, viewed = false, onViewed }: { title: string; url: string; autoFilled?: boolean; initialPage?: number; viewed?: boolean; onViewed?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const updatesFromAnswers = autoFilled || title.startsWith("Official Form");
  const helpText = updatesFromAnswers ? "Your answers automatically update this official PDF. You can preview it at any time." : "Review this document here without leaving your onboarding application.";
  const previewUrl = `${url}#page=${initialPage}&view=FitH&toolbar=1`;

  return (
    <section className="overflow-hidden rounded-2xl border bg-muted/20">
      <div className="flex flex-col gap-4 bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <FileCheck2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{title}</span>
              <span className="rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700">{updatesFromAnswers ? "Auto-filled document" : "Onboarding document"}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{helpText}</p>
          </div>
        </div>
        <div className="hidden shrink-0 md:block">
          <Button type="button" variant="outline" onClick={() => setExpanded((value) => {
            if (!value) onViewed?.();
            return !value;
          })}>
            {expanded ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
            {expanded ? "Hide document" : "Click to view document"}
          </Button>
        </div>
        <Dialog onOpenChange={(open) => { if (open) onViewed?.(); }}>
          <DialogTrigger asChild>
            <Button type="button" className="w-full md:hidden">
              <Maximize2 className="mr-2 h-4 w-4" />
              View document full screen
            </Button>
          </DialogTrigger>
          <DialogContent className="left-0 top-0 h-[100dvh] max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 sm:rounded-none">
            <DialogHeader className="border-b px-5 py-4 pr-12 text-left">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{helpText}</DialogDescription>
            </DialogHeader>
            <iframe key={url} title={`${title} mobile preview`} src={previewUrl} className="h-[calc(100dvh-82px)] w-full bg-white" />
          </DialogContent>
        </Dialog>
      </div>
      {onViewed && <div className={`border-t px-4 py-2 text-xs font-semibold ${viewed ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>{viewed ? "Viewed — acknowledgment unlocked" : "Open this document to unlock the acknowledgment"}</div>}
      {expanded && (
        <div className="hidden border-t md:block">
          <iframe key={url} title={title} src={previewUrl} className="h-[min(760px,75vh)] w-full bg-white" />
        </div>
      )}
    </section>
  );
}
