import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Cloud, Eye, EyeOff, FileCheck2, LockKeyhole, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { buildI9, buildPolicyAcknowledgement, buildW4 } from "@/lib/officialOnboardingForms";

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
  worksiteAddress: string;
  worksiteCity: string;
  worksiteState: string;
  worksiteZip: string;
  startDate: string;
  offeredPosition: string;
  hourlyRate: string;
  supervisorName: string;
  acceptanceDeadline: string;
  employerRepresentativeName: string;
  employerRepresentativeTitle: string;
  employerSignatureName: string;
  offerPreparedAt: string;
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

const policyContent: Record<string, { intro: string; paragraphs?: string[]; bullets?: string[] }> = {
  property: { intro: "Record only company property and equipment actually issued to you. Item identifiers, quantities, and later return information become part of the company record." },
  confidentiality: {
    intro: "Your position may give you access to confidential business, financial, employee, or personal information.",
    bullets: [
      "Do not disclose confidential information to anyone who is not authorized to receive it.",
      "Use reasonable safeguards to prevent oral or written disclosure.",
      "Use confidential information only for company business and share it internally only with people who have a legitimate need to know.",
      "The agreement applies during employment and for the stated exchange period. A violation may lead to removal from the position or other employment action.",
    ],
  },
  trackTik: { intro: "Follow the digital setup instructions below. Your private password is never stored in this onboarding packet." },
  temporary: {
    intro: "Temporary or part-time assignments may cover workload, short-term projects, employee absences, or vacant positions.",
    bullets: [
      "Temporary work does not guarantee permanent status or continued employment.",
      "Normal payroll deductions apply. Eligibility for leave, vacation, holiday pay, hospitalization insurance, or other benefits may be limited.",
      "The assignment length is determined by company needs and may end sooner or, when permitted, continue longer.",
      "Permanent positions require a separate application through the company hiring process.",
    ],
  },
  appearance: {
    intro: "Maintain a safe, sanitary, neat, and professional appearance while working or representing the company.",
    bullets: [
      "Wear clothing and required uniform items appropriate to the position and maintain high standards of personal hygiene and grooming.",
      "Clothing must be clean, neat, and not stained, wrinkled, frayed, revealing, or otherwise unsuitable for work.",
      "Management may require an employee to change inappropriate attire.",
      "Reasonable accommodations may be available for religion, disability, or another legally protected characteristic. Direct questions to a supervisor or administrator.",
    ],
  },
  attendance: {
    intro: "Regular attendance and punctuality are essential. Be ready at the scheduled start time, complete the full shift, and return from breaks on time.",
    bullets: [
      "Request planned time off in writing and in advance under the company time-off policy.",
      "For an unexpected absence, directly notify your supervisor as early as possible, preferably before the shift. Voicemail, text, or email alone is generally not sufficient except in an emergency.",
      "Notify your supervisor promptly if illness or an emergency occurs during work hours. Multi-day absences require daily contact unless instructed otherwise.",
      "Three consecutive days without notice may be treated as voluntary resignation. Repeated absence or tardiness may lead to discipline, including termination.",
    ],
  },
  discipline: {
    intro: "Corrective action is intended to address conduct or performance problems fairly and prevent recurrence.",
    bullets: [
      "Possible action includes verbal or written warnings, suspension with or without pay, and termination, depending on the circumstances.",
      "Serious conduct may result in immediate termination, including workplace violence, harassment, theft, vandalism, unauthorized use of company equipment or vehicles, or disclosure of confidential business information.",
    ],
  },
  drug: {
    intro: "The company maintains a workplace free of substance abuse. Employees may not consume, possess, sell, purchase, or be impaired by alcohol or illegal drugs on company property or in company vehicles.",
    bullets: [
      "Use legal medication only as directed and tell a supervisor if it may affect safe job performance or require an accommodation.",
      "Report for duty unimpaired and promptly report evidence of workplace alcohol or drug abuse or an immediate safety threat.",
      "Employees may be required to complete medical, clinical, random, or incident-related testing as allowed by law.",
      "Violations may result in discipline up to and including termination. When directed, testing must be completed within the stated deadline.",
    ],
  },
  drugTest: {
    intro: "You consent to requested drug or alcohol testing under company policy and to providing an appropriate specimen for analysis.",
    bullets: [
      "Refusal or failure to cooperate may result in employment action under company policy.",
      "Testing providers may analyze the specimen and release relevant results to authorized company personnel or government entities involved in a related legal matter.",
      "Authorized personnel must protect testing information and use it only as needed for employment decisions, inquiries, or legal notices.",
      "Testing may be required after an on-the-job accident or injury when circumstances suggest possible drug or alcohol involvement.",
    ],
  },
  availability: { intro: "Confirm the days and times you are available to work. Submit later availability changes to a manager or supervisor at least 10 days in advance for approval." },
  jobDescription: {
    intro: "Security officers guard, patrol, and monitor premises to help prevent theft, violence, and rule violations.",
    bullets: [
      "Control entrances and departures, patrol buildings and grounds, answer alarms, investigate disturbances, and document daily activity or unusual events.",
      "Contact police or fire services in emergencies and help preserve order and protect people and property.",
      "Warn or remove rule violators when authorized, operate screening equipment, and perform escort or transport duties when assigned.",
      "Typical qualifications include a high school diploma or equivalent, related experience, a state security license, communication skills, active listening, and critical thinking. Duties may change as business needs require.",
    ],
  },
  social: {
    intro: "Online communications are permanent and can affect coworkers, clients, and the company. Use good judgment and follow company policies in every digital channel.",
    bullets: [
      "Do not post confidential, legal, financial, personnel, or private information, and do not speak for the company unless officially authorized.",
      "Be truthful about your identity, protect privacy, obtain permission before posting another person's photo, and respect copyright and fair-use rules.",
      "Do not use company email or social accounts for personal use or post harassment, threats, discrimination, obscenity, abuse, or other unlawful conduct.",
      "When expressing a personal opinion about the company, clearly state that you are not an official spokesperson.",
      "Report policy violations to appropriate leadership. Violations may lead to discipline or termination.",
    ],
  },
  workersComp: {
    intro: "Texas workers' compensation notice for new employees.",
    paragraphs: [
      "If the employer has workers' compensation coverage, you may elect to retain your common-law right of action by notifying the employer in writing no later than five days after beginning employment or receiving written notice that coverage was obtained.",
      "If you retain that common-law right, you cannot receive workers' compensation income or medical benefits if you are injured.",
    ],
  },
  uniform: { intro: "Record each uniform item received or returned. If no uniform was issued, select that option below." },
  schedule: { intro: "Review the worksite, start date, and expected schedule supplied by the accepted company offer." },
  handbook: {
    intro: "You acknowledge receiving and reviewing the employee handbook and agree to become familiar with and follow its policies.",
    bullets: [
      "The company may add, replace, change, or cancel handbook policies and will communicate authorized changes.",
      "Employment is voluntary and at will, with no guaranteed duration. Either you or the company may end employment at any time, subject to applicable law.",
      "Ask your supervisor about any handbook policy you do not understand.",
    ],
  },
};

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

const uniformChecklistRows = [
  "Long sleeve shirt (complete with patches)", "Short sleeve button-up shirt (complete with patches)",
  "Short sleeve shirt (complete with patches)", "High-visibility traffic long sleeve shirt (complete with patches)",
  "High-visibility traffic short sleeve shirt (complete with patches)", "Tie", "Silver badge", "Silver SOs", "Pants",
  "Bomber jacket", "Jacket", "Beanie hat", "Baseball hat", "Flashlight", "Flag patch", "Radio", "ID badge",
  "Additional jacket", "Additional beanie or baseball hat", "Additional flashlight", "Additional flag patch",
] as const;

const scheduleDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const normalizeOfferTime = (value: string) => {
  const match = value.trim().toLowerCase().replace(/\./g, "").match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2] || "00";
  if (match[3] === "pm" && hour < 12) hour += 12;
  if (match[3] === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
};

const scheduleFromOffer = (description: string) => {
  const result: OnboardingData["availabilitySchedule"] = {};
  const range = description.match(/(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:-|–|—|\bto\b)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
  if (!range) return result;
  const start = normalizeOfferTime(range[1]);
  const end = normalizeOfferTime(range[2]);
  if (!start || !end) return result;
  const lower = description.toLowerCase();
  const selected = /weekdays|monday\s*(?:-|–|—|through|to)\s*friday/.test(lower)
    ? scheduleDays.slice(0, 5)
    : /weekends/.test(lower)
      ? scheduleDays.slice(5)
      : scheduleDays.filter((day) => lower.includes(day));
  (selected.length ? selected : scheduleDays).forEach((day) => { result[day] = { start, end }; });
  return result;
};

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
  worksiteAddress: "",
  worksiteCity: "",
  worksiteState: "",
  worksiteZip: "",
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
  supervisorName: "",
  acceptanceDeadline: "",
  employerRepresentativeName: "",
  employerRepresentativeTitle: "",
  employerSignatureName: "",
  offerPreparedAt: "",
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

function SensitiveNumberField({ label, value, onChange, maxLength, placeholder }: { label: string; value: string; onChange: (value: string) => void; maxLength: number; placeholder: string }) {
  const [revealed, setRevealed] = useState(false);
  const id = `employee-onboarding-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label} *</Label>
      <div className="relative">
        <Input
          id={id}
          className={`h-12 pr-12 font-mono text-base tracking-wider ${revealed ? "" : "text-transparent caret-foreground"}`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={maxLength}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, maxLength))}
        />
        {!revealed && value && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 right-12 flex items-center overflow-hidden font-mono text-base tracking-wider text-foreground">{"X".repeat(value.length)}</span>}
        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-10 w-10" onClick={() => setRevealed((current) => !current)} aria-label={revealed ? `Hide ${label}` : `Show ${label}`}>
          {revealed ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </Button>
      </div>
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
  const [hireId, setHireId] = useState<string | null>(null);
  const [hiringApplicationId, setHiringApplicationId] = useState<string | null>(null);
  const [accessState, setAccessState] = useState<"loading" | "locked" | "ready">("loading");
  const [lockedReason, setLockedReason] = useState("A company must send you a completed offer before employee onboarding is available.");
  const [data, setData] = useState(initialData);
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState<"draft" | "submitted">("draft");
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
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
  const [policyConfirmationOpen, setPolicyConfirmationOpen] = useState(false);
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
      const [profileResult, officerResult, hireResult] = await Promise.all([
        supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle(),
        supabase.from("officer_profiles").select("phone,address_street,address_city,address_state,address_zip,availability_schedule,title").eq("id", resolved).maybeSingle(),
        supabase.from("hires").select("id,hiring_application_id,hire_date,position_title,offer_terms,offer_prepared_at,company_profiles(company_name)").eq("officer_id", resolved).eq("status", "active").not("offer_prepared_at", "is", null).not("hiring_application_id", "is", null).order("offer_prepared_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (hireResult.error) throw hireResult.error;
      const hire = hireResult.data as any;
      if (!hire?.id || !hire?.hiring_application_id || !hire?.offer_prepared_at) {
        if (!mounted) return;
        setAccessState("locked");
        setLoaded(true);
        return;
      }

      const [hiringResult, packetResult, maskedResult] = await Promise.all([
        (supabase as any).from("guard_hiring_applications").select("id,company_name,position,applicant_name,applicant_email,application_data").eq("id", hire.hiring_application_id).eq("officer_id", resolved).eq("application_type", "employer_copy").eq("status", "submitted").maybeSingle(),
        (supabase as any).rpc("ensure_officer_onboarding_packet", { _hire_id: hire.id }),
        supabase.functions.invoke("manage-sensitive-data", { body: { action: "get_masked_data", data: {} } }),
      ]);
      if (hiringResult.error) throw hiringResult.error;
      if (packetResult.error) throw packetResult.error;
      const hiring = hiringResult.data;
      if (!hiring?.id) {
        if (!mounted) return;
        setLockedReason("Your offer is not connected to a submitted application. Ask the company to resend the offer from its Applicants page.");
        setAccessState("locked");
        setLoaded(true);
        return;
      }
      if (!mounted) return;
      const existing = packetResult.data;
      const snapshot = (hiring.application_data || {}) as Record<string, any>;
      const fullName = (snapshot.applicantName || hiring.applicant_name || profileResult.data?.full_name || "").trim().split(/\s+/).filter(Boolean);
      const saved = existing?.form_data || {};
      const offer = (hire?.offer_terms || {}) as Record<string, string>;
      setData({
        ...initialData,
        legalFirstName: fullName[0] || "",
        middleInitial: fullName.length > 2 ? fullName.slice(1, -1).map((part: string) => part[0]).join("") : "",
        legalLastName: fullName.length > 1 ? fullName[fullName.length - 1] : "",
        email: snapshot.email || hiring.applicant_email || profileResult.data?.email || "",
        phone: snapshot.phone || officerResult.data?.phone || "",
        address: snapshot.address || officerResult.data?.address_street || "",
        city: snapshot.city || officerResult.data?.address_city || "",
        state: snapshot.state || officerResult.data?.address_state || "",
        zip: snapshot.zip || officerResult.data?.address_zip || "",
        availabilitySchedule: snapshot.availability?.schedule || (officerResult.data as any)?.availability_schedule || {},
        ...saved,
        employerName: hire.company_profiles?.company_name || hiring.company_name || snapshot.companyName || "Your hiring company",
        startDate: offer.startDate || hire.hire_date || snapshot.startDate || "",
        offeredPosition: offer.positionTitle || offer.offeredPosition || hire.position_title || hiring.position || snapshot.position || officerResult.data?.title || "Security Officer",
        hourlyRate: offer.hourlyRate || "",
        supervisorName: offer.supervisorName || "",
        scheduledPost: offer.worksiteName || offer.scheduledPost || "",
        scheduledShift: offer.expectedSchedule || offer.scheduledShift || "",
        worksiteAddress: offer.worksiteAddress || "",
        worksiteCity: offer.worksiteCity || "",
        worksiteState: offer.worksiteState || "",
        worksiteZip: offer.worksiteZip || "",
        availabilitySchedule: Object.keys(scheduleFromOffer(offer.expectedSchedule || offer.scheduledShift || "")).length
          ? scheduleFromOffer(offer.expectedSchedule || offer.scheduledShift || "")
          : saved.availabilitySchedule || snapshot.availability?.schedule || (officerResult.data as any)?.availability_schedule || {},
        acceptanceDeadline: offer.acceptanceDeadline || "",
        employerRepresentativeName: offer.representativeName || "",
        employerRepresentativeTitle: offer.representativeTitle || "",
        employerSignatureName: offer.employerSignatureName || offer.representativeName || "",
        offerPreparedAt: hire.offer_prepared_at,
      });
      setHireId(hire.id);
      setHiringApplicationId(hiring.id);
      setPacketId(existing?.id || null);
      setCurrentStep(Math.min(Number(existing?.current_step || 0), 7));
      setStatus(existing?.status === "submitted" ? "submitted" : "draft");
      setSubmittedAt(existing?.submitted_at || null);
      setI9SubmittedAt(existing?.i9_submitted_at || null);
      setW4SubmittedAt(existing?.w4_submitted_at || null);
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
      setAccessState("ready");
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
    if (!loaded || accessState !== "ready" || !activeOfficerId || !hireId || !hiringApplicationId) return false;
    setSaving(true);
    try {
      const draftData = dataOverride || data;
      const payload: any = {
        user_id: userId,
        officer_id: activeOfficerId,
        hire_id: hireId,
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
  }, [data, currentStep, loaded, accessState, activeOfficerId, hireId, hiringApplicationId, status]);

  const policyDetailsComplete = (key: string) => {
    if (key === "trackTik") return Boolean(data.trackTikUsername && data.trackTikPasswordSet);
    if (key === "uniform") {
      const fields = data.policyAcknowledgements[key]?.documentFields || {};
      return fields.uniformNone === "true" || uniformChecklistRows.some((_, index) => fields[`uniformReceived:${index}`] === "true" || fields[`uniformReturned:${index}`] === "true");
    }
    if (key === "schedule") {
      return Boolean(data.scheduledPost && data.worksiteAddress && data.worksiteCity && data.worksiteState && data.worksiteZip && data.startDate && data.scheduledShift);
    }
    return true;
  };
  const policiesComplete = Boolean(data.offerPreparedAt) && policyItems.every(([key]) => {
    const acknowledgement = data.policyAcknowledgements[key];
    return Boolean(data.policies[key] && policyDetailsComplete(key) && acknowledgement?.viewedAt && acknowledgement.accepted && acknowledgement.printedName && acknowledgement.signatureDate && acknowledgement.signatureImage);
  });
  const i9AuthorizationComplete = data.citizenshipStatus !== "Authorized to work until a specified date" || Boolean(data.workAuthorizationExpiration && (data.alienNumber || data.i94Number || (data.foreignPassportNumber && data.passportCountry)));
  const bankAccountsComplete = savedBankAccounts.length > 0 || (bankAccounts.length > 0 && bankAccounts.every((account, index) => Boolean(
    account.bankName && account.bankCity && account.bankState && /^\d{9}$/.test(account.routingNumber.replace(/\D/g, "")) && /^\d{4,17}$/.test(account.accountNumber.replace(/\D/g, "")) && (index === bankAccounts.length - 1 ? account.allocationType === "entire" : account.allocationType === "amount" && Number(account.allocationAmount) > 0)
  )));
  const directDepositComplete = bankAccountsComplete && data.bankAuthorizationAccepted && Boolean(data.bankSignatureName && data.bankSignatureDate && data.bankSignatureImage);
  const completeStep = (step: number) => (step === 0 ? Boolean(accessState === "ready" && hireId && hiringApplicationId && data.offerPreparedAt) : step === 1 ? Boolean(data.legalFirstName && data.legalLastName && data.address && data.city && data.state && data.zip && data.dateOfBirth && data.email && data.phone && data.citizenshipStatus && (ssnMasked || isValidSsn(ssn)) && data.signatureImage && (data.citizenshipStatus !== "Lawful permanent resident" || data.alienNumber) && i9AuthorizationComplete) : step === 2 ? Boolean(data.filingStatus && data.w4SignatureName && data.w4SignatureDate && data.w4SignatureImage) : step === 3 ? data.paymentMethod === "paper_check" || directDepositComplete : step === 4 ? Boolean(data.emergencyName && data.emergencyRelationship && data.emergencyPhone) : step === 5 ? policiesComplete : step === 6 ? Boolean(data.offerPreparedAt && data.startDate && data.scheduledPost && data.scheduledShift && data.supervisorName) : Boolean(data.signatureName && data.signatureDate && data.signatureImage));
  const allComplete = useMemo(() => Array.from({ length: 8 }, (_, index) => completeStep(index)).every(Boolean), [data, ssn, ssnMasked, bankAccounts, savedBankAccounts, accessState, hireId, hiringApplicationId]);

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

  const archiveComplianceDocument = async (documentType: string, documentLabel: string, bytes: Uint8Array, signedAt?: string, metadata: Record<string, unknown> = {}) => {
    if (!packetIdRef.current || !activeOfficerId) throw new Error("The onboarding file is not ready yet");
    const existing = await (supabase as any).from("officer_compliance_documents").select("version").eq("packet_id", packetIdRef.current).eq("document_type", documentType).order("version", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    const version = Number(existing.data?.version || 0) + 1;
    const submittedAt = new Date().toISOString();
    const safeTime = submittedAt.replace(/[:.]/g, "-");
    const storagePath = `${userId}/${packetIdRef.current}/compliance/${documentType}/v${version}-${safeTime}.pdf`;
    const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
    const sha256 = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
    const upload = await supabase.storage.from("onboarding-documents").upload(storagePath, new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), { upsert: false, contentType: "application/pdf" });
    if (upload.error) throw upload.error;
    const record = await (supabase as any).from("officer_compliance_documents").insert({
      packet_id: packetIdRef.current,
      officer_id: activeOfficerId,
      hiring_application_id: hiringApplicationId,
      document_type: documentType,
      document_label: documentLabel,
      version,
      storage_path: storagePath,
      sha256,
      signed_at: signedAt || null,
      submitted_at: submittedAt,
      metadata,
      created_by: userId,
    });
    if (record.error) throw record.error;
    return { storagePath, submittedAt, version };
  };

  const go = async (nextStep: number) => {
    const destination = Math.max(0, Math.min(7, nextStep));
    try {
      if (currentStep === 1 && isValidSsn(ssn)) await saveSensitiveForStep(currentStep);
      if (currentStep === 3 && (data.paymentMethod === "paper_check" || directDepositComplete)) await saveSensitiveForStep(currentStep);
      if (!(await saveDraft(destination))) throw new Error("Your progress could not be saved");
      setCurrentStep(destination);
      requestAnimationFrame(() => document.getElementById("employee-onboarding-top")?.scrollIntoView({ behavior: "auto", block: "start" }));
    } catch (error: any) {
      toast.error(error.message || "Your progress could not be saved");
    }
  };

  const next = async () => {
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
      const archived = await archiveComplianceDocument("form-i9", "Signed Form I-9", i9Bytes, data.signatureDate, { form: "USCIS I-9", employeeSection: 1 });
      const i9Path = archived.storagePath;
      const submittedAt = archived.submittedAt;
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
      const archived = await archiveComplianceDocument("form-w4", "Signed Form W-4", w4Bytes, data.w4SignatureDate, { form: "IRS W-4" });
      const w4Path = archived.storagePath;
      const submittedAt = archived.submittedAt;
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
    const governmentFormsNeedArchiving = !i9SubmittedAt || !w4SubmittedAt;
    if (governmentFormsNeedArchiving && !isValidSsn(ssn)) {
      toast.error("Re-enter your SSN on the I-9 step so the official I-9 and W-4 can be securely generated");
      setCurrentStep(1);
      return;
    }
    setSubmitting(true);
    try {
      await saveSensitiveForStep(currentStep);
      let i9Path: string | undefined;
      let w4Path: string | undefined;
      if (governmentFormsNeedArchiving) {
        const normalizedSsn = formatSsn(ssn);
        const [i9Bytes, w4Bytes] = await Promise.all([buildI9(data, normalizedSsn), buildW4(data, normalizedSsn)]);
        if (!i9SubmittedAt) {
          const i9Archive = await archiveComplianceDocument("form-i9", "Signed Form I-9", i9Bytes, data.signatureDate, { form: "USCIS I-9", packetSubmission: true });
          i9Path = i9Archive.storagePath;
        }
        if (!w4SubmittedAt) {
          const w4Archive = await archiveComplianceDocument("form-w4", "Signed Form W-4", w4Bytes, data.w4SignatureDate, { form: "IRS W-4", packetSubmission: true });
          w4Path = w4Archive.storagePath;
        }
      }
      const submittedAt = new Date().toISOString();
      const submissionUpdate: Record<string, unknown> = {
        status: "submitted",
        current_step: 7,
        form_data: data,
        signature_name: data.signatureName,
        signature_date: data.signatureDate,
        i9_submitted_at: i9SubmittedAt || submittedAt,
        w4_submitted_at: w4SubmittedAt || submittedAt,
        submitted_at: submittedAt,
        updated_at: submittedAt,
      };
      if (i9Path) submissionUpdate.i9_document_path = i9Path;
      if (w4Path) submissionUpdate.w4_document_path = w4Path;
      const { error } = await (supabase as any)
        .from("officer_onboarding_packets")
        .update(submissionUpdate)
        .eq("id", packetIdRef.current);
      if (error) throw error;
      setCurrentStep(7);
      setStatus("submitted");
      setSubmittedAt(submittedAt);
      toast.success(`Onboarding complete — your packet was sent to ${data.employerName}`);
      onChanged?.();
    } catch (error: any) {
      toast.error(error.message || "Onboarding could not be submitted");
    } finally {
      setSubmitting(false);
    }
  };

  const completedStepCount = Array.from({ length: steps.length }, (_, index) => completeStep(index)).filter(Boolean).length;
  const progress = Math.round((completedStepCount / steps.length) * 100);
  const isPolicyComplete = (key: string) => {
    const acknowledgement = data.policyAcknowledgements[key];
    return Boolean(data.policies[key] && policyDetailsComplete(key) && acknowledgement?.viewedAt && acknowledgement.accepted && acknowledgement.printedName && acknowledgement.signatureDate && acknowledgement.signatureImage);
  };
  const completedPolicyCount = policyItems.filter(([key]) => isPolicyComplete(key)).length;
  const openPolicy = (key: string) => {
    setActivePolicyKey(key);
    setData((current) => {
      const existing = current.policyAcknowledgements[key];
      const reusable = [...Object.values(current.policyAcknowledgements)].reverse().find((item) => Boolean(item.signatureImage));
      const identity = {
        printedName: existing?.printedName || reusable?.printedName || [current.legalFirstName, current.middleInitial, current.legalLastName].filter(Boolean).join(" "),
        employeeTitle: existing?.employeeTitle || reusable?.employeeTitle || current.offeredPosition || "Security Officer",
        signatureDate: existing?.signatureDate || reusable?.signatureDate || new Date().toISOString().slice(0, 10),
        signatureImage: existing?.signatureImage || reusable?.signatureImage || current.signatureImage || "",
      };
      return {
        ...current,
        policyAcknowledgements: {
          ...current.policyAcknowledgements,
          [key]: existing ? { ...existing, ...identity, viewedAt: existing.viewedAt || new Date().toISOString() } : { viewedAt: new Date().toISOString(), ...identity, accepted: false, notes: "", documentFields: {} },
        },
      };
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const tab = document.getElementById(`policy-tab-${key}`);
      const scroller = document.getElementById("policy-tabs-scroll");
      if (tab && scroller) {
        scroller.scrollTo({ left: tab.offsetLeft - scroller.clientWidth / 2 + tab.clientWidth / 2, behavior: "smooth" });
      }
    }));
  };
  useEffect(() => {
    if (!loaded || currentStep !== 5 || activePolicyKey) return;
    const nextPolicy = policyItems.find(([key]) => !isPolicyComplete(key)) || policyItems[0];
    openPolicy(nextPolicy[0]);
  }, [loaded, currentStep, activePolicyKey]);
  const updatePolicyAcknowledgement = (key: string, changes: Partial<PolicyAcknowledgement>) => {
    setData((current) => ({
      ...current,
      policies: { ...current.policies, [key]: false },
      policyAcknowledgements: {
        ...current.policyAcknowledgements,
        [key]: { ...current.policyAcknowledgements[key], ...changes },
      },
    }));
  };
  const updateTrackTik = (field: "trackTikUsername" | "employeeIdNumber" | "trackTikPasswordSet", value: string | boolean) => {
    setData((current) => ({ ...current, [field]: value, policies: { ...current.policies, trackTik: false } }));
  };
  const savePolicyAcknowledgement = async (key: string) => {
    const acknowledgement = data.policyAcknowledgements[key];
    if (!acknowledgement?.viewedAt) {
      toast.error("Open and review this policy section before signing and saving it");
      return;
    }
    if (!acknowledgement?.accepted || !acknowledgement.printedName || !acknowledgement.signatureDate || !acknowledgement.signatureImage) {
      toast.error("Accept the policy, add your name and date, and sign before saving");
      return;
    }
    if (!policyDetailsComplete(key)) {
      toast.error(key === "trackTik" ? "Add the TrackTik username, then confirm the password was set" : key === "uniform" ? "Check the uniform items received or returned, or confirm that no items were issued" : "The company must provide the complete worksite, start date, and expected schedule in the offer");
      return;
    }
    const policyItem = policyItems.find(([itemKey]) => itemKey === key);
    if (!policyItem) return;
    try {
      const [, label, path] = policyItem;
      const result = await buildPolicyAcknowledgement(path, { title: label, ...acknowledgement }, data);
      await archiveComplianceDocument(`policy-${key}`, label, result.bytes, acknowledgement.signatureDate, {
        viewedAt: acknowledgement.viewedAt,
        accepted: acknowledgement.accepted,
        employeeName: acknowledgement.printedName,
        employerName: data.employerName,
      });
    } catch (error: any) {
      toast.error(error.message || "The signed company record could not be archived");
      return;
    }
    const nextData = { ...data, policies: { ...data.policies, [key]: true } };
    setData(nextData);
    const saved = await saveDraft(currentStep, nextData);
    if (!saved) {
      setData((current) => ({ ...current, policies: { ...current.policies, [key]: false } }));
      toast.error("The section could not be saved. Please try again.");
      return;
    }
    toast.success("Section signed, saved, and marked complete");
    const currentIndex = policyItems.findIndex(([k]) => k === key);
    const nextItem = policyItems[currentIndex + 1];
    if (nextItem) {
      const nextKey = nextItem[0];
      setActivePolicyKey(nextKey);
      openPolicy(nextKey);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById(`policy-${nextKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    } else {
      setPolicyConfirmationOpen(true);
    }
  };
  if (!loaded)
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-8 text-center text-muted-foreground">Loading employee onboarding…</CardContent>
      </Card>
    );

  if (accessState === "locked")
    return (
      <Card className="mx-auto max-w-2xl rounded-2xl border-amber-200 bg-amber-50">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="rounded-2xl bg-amber-100 p-4 text-amber-800"><LockKeyhole className="h-8 w-8" /></div>
          <div>
            <h2 className="text-2xl font-bold">Employee onboarding is locked</h2>
            <p className="mt-2 text-amber-950/75">{lockedReason}</p>
          </div>
        </CardContent>
      </Card>
    );

  if (status === "submitted")
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 py-4 sm:py-8">
        <Card className="overflow-hidden rounded-3xl border-green-200 shadow-sm">
          <div className="h-2 bg-green-600" />
          <CardContent className="flex flex-col items-center px-6 py-10 text-center sm:px-12 sm:py-14">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-700">
              <CheckCircle2 className="h-11 w-11" />
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-green-700">Onboarding complete</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Your onboarding packet has been submitted</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              {data.employerName} can now review your completed forms and signed records. Someone from the company will contact you with your next steps.
            </p>
            <div className="mt-8 grid w-full gap-3 text-left sm:grid-cols-2">
              <div className="flex gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
                <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
                <div><p className="font-semibold text-green-950">All onboarding steps completed</p><p className="mt-1 text-sm text-green-900/70">Your completed packet is preserved for the company’s records.</p></div>
              </div>
              <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div><p className="font-semibold">Waiting for company follow-up</p><p className="mt-1 text-sm text-muted-foreground">There is nothing else you need to complete right now.</p></div>
              </div>
            </div>
            {submittedAt && <p className="mt-6 text-sm text-muted-foreground">Submitted {new Date(submittedAt).toLocaleString()}</p>}
          </CardContent>
        </Card>
      </div>
    );

  return (
    <form id="employee-onboarding-top" onSubmit={submit} className="w-full max-w-none scroll-mt-4 pb-24 lg:pb-8">
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
      <div className="grid items-start gap-8 lg:grid-cols-[270px_minmax(0,900px)] lg:justify-center">
        <aside className="hidden lg:block">
          <nav className="sticky top-4 space-y-2 rounded-2xl border bg-zinc-100 p-3 shadow-inner">
            {steps.map((step, index) => (
              <button key={step[0]} type="button" onClick={() => go(index)} className={`group flex min-h-[84px] w-full items-center gap-3 rounded-lg border bg-white px-3 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${index === currentStep ? "border-primary ring-2 ring-primary/20" : "border-border"}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold ${index === currentStep ? "bg-primary text-primary-foreground" : completeStep(index) ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}>{completeStep(index) && index !== currentStep ? <Check className="h-4 w-4" /> : index + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Page {index + 1}: {step[0]}</span>
                  <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{step[1]}</span>
                  <span className={`mt-1 block text-[10px] font-bold uppercase tracking-wide ${completeStep(index) ? "text-green-700" : "text-amber-700"}`}>{completeStep(index) ? "Complete" : "Needs information"}</span>
                </span>
              </button>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">
          <div className="mb-4 lg:hidden">
            <div className="mb-3 flex justify-between"><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">Page {currentStep + 1} of 8</span><span className="text-sm text-muted-foreground">{progress}% complete</span></div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {steps.map((step, index) => <button key={step[0]} type="button" onClick={() => go(index)} aria-label={`Open ${step[0]}`} className={`flex h-12 min-w-12 items-center justify-center rounded-lg border text-sm font-bold shadow-sm ${index === currentStep ? "border-primary bg-primary text-primary-foreground" : completeStep(index) ? "border-green-300 bg-green-50 text-green-700" : "bg-background text-muted-foreground"}`}>{completeStep(index) && index !== currentStep ? <Check className="h-4 w-4" /> : index + 1}</button>)}
            </div>
          </div>
          <Card className="relative min-w-0 overflow-hidden rounded-lg border-zinc-300 bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.45)] ring-1 ring-black/5 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary">
            <CardHeader className="border-b bg-zinc-50/70 px-5 py-6 sm:px-10">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Onboarding page {currentStep + 1} of {steps.length}</p>
              <CardTitle className="text-2xl sm:text-3xl">{steps[currentStep][0]}</CardTitle>
              <CardDescription className="text-base">{steps[currentStep][1]}</CardDescription>
            </CardHeader>
            {currentStep === 5 && (
              <div className="border-b bg-white px-5 py-4 sm:px-10">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Policy sections</p>
                  <p className="text-xs font-semibold text-primary">{completedPolicyCount} of {policyItems.length} complete</p>
                </div>
                <div id="policy-tabs-scroll" className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Company policy sections">
                  {policyItems.map(([key, label], index) => {
                    const complete = isPolicyComplete(key);
                    const selected = activePolicyKey === key;
                    return (
                      <button
                        key={key}
                        id={`policy-tab-${key}`}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => openPolicy(key)}
                        className={`flex min-w-[150px] max-w-[190px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-all ${selected ? "border-primary bg-primary text-primary-foreground shadow-md" : complete ? "border-green-300 bg-green-50 text-green-800 hover:border-green-500" : "bg-zinc-50 text-foreground hover:border-primary/50 hover:bg-primary/5"}`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${selected ? "bg-white/20" : complete ? "bg-green-600 text-white" : "bg-white text-muted-foreground shadow-sm"}`}>{complete ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>
                        <span className="line-clamp-2 leading-tight">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <CardContent className="min-h-[650px] px-5 py-7 sm:px-10 sm:py-10">
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
                  <div className="rounded-2xl border bg-zinc-50 p-5"><h3 className="font-semibold">Your onboarding packet</h3><p className="mt-1 text-sm text-muted-foreground">Move between any page at any time. Incomplete pages stay marked so you can return before final submission.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{steps.slice(1).map((step, index) => <button key={step[0]} type="button" onClick={() => go(index + 1)} className="flex items-center gap-3 rounded-xl border bg-white p-3 text-left hover:border-primary/50 hover:shadow-sm"><span className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold ${completeStep(index + 1) ? "bg-green-600 text-white" : "bg-muted"}`}>{completeStep(index + 1) ? <Check className="h-4 w-4" /> : index + 2}</span><span className="text-sm font-medium">{step[0]}</span></button>)}</div></div>
                </div>
              )}
              {currentStep === 1 && (
                <div className="space-y-6">
                  <div className="rounded-xl bg-primary/5 p-4 text-sm">
                    <strong>USCIS Form I-9 — Employee Section 1.</strong> Complete the guided fields below. We Find Guards creates and securely archives the official form for your employer; your employer completes Section 2.
                  </div>
                  <div className="space-y-6">
                      <div className="grid gap-5 md:grid-cols-3 2xl:grid-cols-2">
                    <Field label="Legal first name" value={data.legalFirstName} onChange={(v) => update("legalFirstName", v)} required />
                    <Field label="Middle initial" value={data.middleInitial} onChange={(v) => update("middleInitial", v)} />
                    <Field label="Legal last name" value={data.legalLastName} onChange={(v) => update("legalLastName", v)} required />
                    <div className="md:col-span-3 2xl:col-span-2">
                      <Field label="Other last names used" value={data.otherLastNames} onChange={(v) => update("otherLastNames", v)} />
                    </div>
                    <div className="md:col-span-2 2xl:col-span-1">
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
                </div>
              )}
              {currentStep === 2 && (
                <div className="space-y-7">
                  <div className="rounded-xl bg-primary/5 p-4 text-sm">
                    <strong>IRS Form W-4 — Employee’s Withholding Certificate.</strong> Enter your withholding choices below. We Find Guards creates and securely archives the official form for your employer.
                  </div>
                  <div className="space-y-7">
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
                </div>
              )}
              {currentStep === 3 && (
                <div className="space-y-7">
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><strong>Digital pay authorization</strong><p className="mt-1">Choose how you want to be paid. If you select direct deposit, your bank information is encrypted separately and the signed authorization is created for company records.</p></div>
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
                            <SensitiveNumberField label="9-digit routing number" value={account.routingNumber} onChange={(v) => updateBankAccount(account.id, "routingNumber", v)} maxLength={9} placeholder="Enter routing number" />
                            <SensitiveNumberField label="Account number" value={account.accountNumber} onChange={(v) => updateBankAccount(account.id, "accountNumber", v)} maxLength={17} placeholder="Enter account number" />
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
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><strong>Emergency contact record</strong><p className="mt-1">Enter the person your employer should contact in an emergency. Optional medical instructions are shared only as part of this employment record.</p></div>
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
                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">How company policies work</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-background p-4"><strong className="block">1. Read it</strong><span className="text-sm text-muted-foreground">Every required term is shown directly in the app.</span></div>
                      <div className="rounded-xl bg-background p-4"><strong className="block">2. Complete it</strong><span className="text-sm text-muted-foreground">Add any requested information and acknowledge the policy.</span></div>
                      <div className="rounded-xl bg-background p-4"><strong className="block">3. Sign and save</strong><span className="text-sm text-muted-foreground">We create the company’s archived record in the background.</span></div>
                    </div>
                    <p className="mt-4 text-sm font-medium">{completedPolicyCount} of {policyItems.length} policy sections completed</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-primary/10"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round((completedPolicyCount / policyItems.length) * 100)}%` }} /></div>
                  </div>
                  <div className="grid gap-5 rounded-2xl border p-5 md:grid-cols-2">
                    {data.offerPreparedAt ? (
                      <div className="md:col-span-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-950">
                        <strong className="block">Company-prepared offer</strong>
                        {data.employerName} approved these terms. You already reviewed and accepted the archived employment offer before onboarding was unlocked.
                      </div>
                    ) : (
                      <div className="md:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong className="block">Waiting for prepared offer</strong>Your hiring company has not prepared the offer terms yet.</div>
                    )}
                    <div className="rounded-xl border p-4"><span className="text-xs text-muted-foreground">Position</span><strong className="block">{data.offeredPosition || "Not provided"}</strong></div>
                    <div className="rounded-xl border p-4"><span className="text-xs text-muted-foreground">Pay</span><strong className="block">{data.hourlyRate ? `$${Number(data.hourlyRate).toFixed(2)} per hour` : "Not provided"}</strong></div>
                    <div className="rounded-xl border p-4"><span className="text-xs text-muted-foreground">Start date</span><strong className="block">{data.startDate || "Not provided"}</strong></div>
                    <div className="rounded-xl border p-4"><span className="text-xs text-muted-foreground">Supervisor</span><strong className="block">{data.supervisorName || "Not provided"}</strong></div>
                    <div className="rounded-xl border p-4"><span className="text-xs text-muted-foreground">Assignment</span><strong className="block">{data.scheduledPost || "Not provided"}</strong></div>
                    <div className="rounded-xl border p-4"><span className="text-xs text-muted-foreground">Expected shift</span><strong className="block">{data.scheduledShift || "Not provided"}</strong></div>
                  </div>
                  {policyItems.filter(([key]) => key === activePolicyKey).map(([key, label]) => {
                    const policyIndex = policyItems.findIndex(([itemKey]) => itemKey === key);
                    const acknowledgement = data.policyAcknowledgements[key];
                    const viewed = Boolean(acknowledgement?.viewedAt);
                    const completed = Boolean(data.policies[key] && policyDetailsComplete(key) && viewed && acknowledgement?.accepted && acknowledgement.printedName && acknowledgement.signatureDate && acknowledgement.signatureImage);
                    return (
                      <div key={key} id={`policy-${key}`} role="tabpanel" aria-live="polite" className={`scroll-mt-4 overflow-hidden rounded-2xl border-2 bg-background shadow-lg ring-4 ring-primary/5 animate-in fade-in-0 slide-in-from-right-2 duration-300 ${completed ? "border-green-400" : "border-primary/40"}`}>
                        <div className={`flex flex-wrap items-center gap-3 border-b p-4 sm:p-5 ${completed ? "bg-green-50" : "bg-primary/5"}`}>
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${completed ? "bg-green-600 text-white" : "bg-primary text-primary-foreground"}`}>{completed ? <Check className="h-5 w-5" /> : <FileCheck2 className="h-5 w-5" />}</div>
                          <div className="min-w-0 flex-1">
                            <p className={`mb-1 text-[11px] font-bold uppercase tracking-[.16em] ${completed ? "text-green-700" : "text-primary"}`}>Now viewing · Section {policyIndex + 1} of {policyItems.length}</p>
                            <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{label}</h3>{completed && <span className="rounded-full bg-green-600 px-2.5 py-1 text-xs font-semibold text-white">Completed</span>}</div>
                            <p className="text-sm text-muted-foreground">{completed ? "Reviewed, signed, and saved. You can still update this section." : "Read the digital terms, add the required information, and sign below."}</p>
                          </div>
                        </div>
                        {acknowledgement && (
                          <div className="space-y-6 p-4 sm:p-6">
                            <DigitalPolicyContent title={label} content={policyContent[key]} />
                              <div className="space-y-6">
                                <div className="rounded-xl bg-primary/5 p-4 text-sm"><strong>Complete and sign.</strong> Your name and role are filled from your profile when available. The final company record is created after you save.</div>
                                <div className="grid gap-5 md:grid-cols-2">
                                  <Field label="Employee legal name" value={acknowledgement.printedName} onChange={(value) => updatePolicyAcknowledgement(key, { printedName: value })} required />
                                  <Field label="Position or title" value={acknowledgement.employeeTitle} onChange={(value) => updatePolicyAcknowledgement(key, { employeeTitle: value })} required />
                                  <Field label="Date signed" type="date" value={acknowledgement.signatureDate} onChange={(value) => updatePolicyAcknowledgement(key, { signatureDate: value })} required />
                                  <div className="space-y-2"><Label>Notes for this section</Label><Textarea rows={3} value={acknowledgement.notes} onChange={(event) => updatePolicyAcknowledgement(key, { notes: event.target.value })} placeholder="Optional" /></div>
                                </div>
                                {key === "property" && (
                                  <PropertyDocumentFields acknowledgement={acknowledgement} data={data} onChange={(field, value) => updatePolicyAcknowledgement(key, { documentFields: { ...acknowledgement.documentFields, [field]: value } })} />
                                )}
                                {key === "trackTik" && <TrackTikDocumentFields data={data} onChange={updateTrackTik} />}
                                {key === "uniform" && (
                                  <UniformDocumentFields acknowledgement={acknowledgement} onChange={(field, value) => updatePolicyAcknowledgement(key, { documentFields: { ...acknowledgement.documentFields, [field]: value } })} />
                                )}
                                {key === "schedule" && (
                                  <ScheduleDocumentFields data={data} />
                                )}
                                <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4">
                                  <Checkbox checked={acknowledgement.accepted} onCheckedChange={(value) => updatePolicyAcknowledgement(key, { accepted: Boolean(value) })} />
                                  <span className="text-sm"><strong className="block">I have reviewed and accept this policy.</strong>I read the complete digital terms shown above and agree to the responsibilities that apply to my employment.</span>
                                </label>
                                <SignaturePad value={acknowledgement.signatureImage} suggestedName={acknowledgement.printedName} onChange={(value) => updatePolicyAcknowledgement(key, { signatureImage: value })} />
                                <Button type="button" size="lg" className="w-full" onClick={() => savePolicyAcknowledgement(key)}><FileCheck2 className="mr-2 h-5 w-5" />{completed ? "Update saved section" : "Sign and save section"}</Button>
                              </div>
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
                    {data.offerPreparedAt ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border bg-muted/20 p-4"><span className="text-xs text-muted-foreground">Post or assignment</span><strong className="block">{data.scheduledPost}</strong></div>
                        <div className="rounded-xl border bg-muted/20 p-4"><span className="text-xs text-muted-foreground">Expected shift</span><strong className="block">{data.scheduledShift}</strong></div>
                        <div className="rounded-xl border bg-muted/20 p-4"><span className="text-xs text-muted-foreground">Employment start date</span><strong className="block">{data.startDate}</strong></div>
                        <div className="rounded-xl border bg-muted/20 p-4"><span className="text-xs text-muted-foreground">Supervisor</span><strong className="block">{data.supervisorName}</strong></div>
                        <p className="sm:col-span-2 text-sm text-muted-foreground">These details were prepared by {data.employerName}. Contact the company if a term needs to change.</p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Your hiring company must prepare the assignment and offer terms before you can confirm this step.</div>
                    )}
                  </div>
                </div>
              )}
              {currentStep === 7 && (
                <div className="space-y-7">
                  <div className="rounded-2xl border bg-muted/30 p-5">
                    <h3 className="font-semibold">Packet review</h3>
                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      {steps.slice(1, 7).map((step, index) => (
                        <button key={step[0]} type="button" onClick={() => go(index + 1)} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/5">
                          {completeStep(index + 1) ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" /> : <span className="h-4 w-4 shrink-0 rounded-full border" />}
                          <span className="flex-1">{step[0]}</span>
                          <span className="text-xs text-muted-foreground">{completeStep(index + 1) ? "Complete" : "Needs information"}</span>
                        </button>
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
                Save and next page
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
            Save and next page
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        ) : (
          <Button type="submit" size="lg" className="flex-1" disabled={submitting || !allComplete || status === "submitted"}>
            <FileCheck2 className="mr-2 h-5 w-5" />
            {status === "submitted" ? "Submitted" : "Submit onboarding"}
          </Button>
        )}
      </div>
      <AlertDialog open={policyConfirmationOpen} onOpenChange={setPolicyConfirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{completedPolicyCount === policyItems.length ? "Confirm your company policy information" : "Review your company policy sections"}</AlertDialogTitle>
            <AlertDialogDescription>
              {completedPolicyCount === policyItems.length
                ? "You have completed all 16 policy sections. Please confirm that the information, acknowledgements, and signatures you provided are correct before continuing to Page 7."
                : `You saved the final policy section, but ${policyItems.length - completedPolicyCount} ${policyItems.length - completedPolicyCount === 1 ? "section still needs" : "sections still need"} information. You can continue to Page 7 and return here from the packet review before submitting.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Review again</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={() => { setPolicyConfirmationOpen(false); void go(6); }}>
              Yes, continue to Page 7
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        <h4 className="mt-1 text-lg font-semibold">Record issued company property</h4>
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

function TrackTikDocumentFields({ data, onChange }: { data: OnboardingData; onChange: (field: "trackTikUsername" | "employeeIdNumber" | "trackTikPasswordSet", value: string | boolean) => void }) {
  return (
    <section className="space-y-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">TrackTik account information</p>
        <h4 className="mt-1 text-lg font-semibold">Set up your TrackTik account</h4>
        <p className="mt-1 text-sm text-muted-foreground">Complete these instructions before entering the account information below.</p>
      </div>
      <div className="rounded-xl border bg-background p-4 sm:p-5">
        <p className="font-semibold">TrackTik setup instructions</p>
        <ol className="mt-3 space-y-3 text-sm text-foreground">
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span><span>Download the <strong>TrackTik Shift</strong> app from the Apple App Store or Google Play Store.</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span><span>Open the app and enter <strong className="font-mono">kairos.staffr.net</strong> in the URL box.</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span><span>Your username is normally your first initial followed by your last name—for example, <strong className="font-mono">jdoe</strong>.</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span><span>Sign in with the temporary password <strong className="font-mono">#Security2020</strong>, then create a new private password when prompted.</span></li>
        </ol>
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">We Find Guards records only that your password was set. Your private password is never stored or displayed in this onboarding packet.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="TrackTik username" value={data.trackTikUsername} onChange={(value) => onChange("trackTikUsername", value)} required placeholder="Example: lrose" />
        <Field label="Employee number (optional)" value={data.employeeIdNumber} onChange={(value) => onChange("employeeIdNumber", value)} placeholder="The company can assign this later" />
      </div>
      <label className="flex items-start gap-3 rounded-xl border bg-background p-4">
        <Checkbox checked={data.trackTikPasswordSet} onCheckedChange={(value) => onChange("trackTikPasswordSet", Boolean(value))} />
        <span className="text-sm"><strong className="block">My TrackTik password has been set *</strong>Only the completion status is stored. Your private password is never exposed.</span>
      </label>
    </section>
  );
}

function UniformDocumentFields({ acknowledgement, onChange }: { acknowledgement: PolicyAcknowledgement; onChange: (field: string, value: string) => void }) {
  const fields = acknowledgement.documentFields || {};
  const toggle = (field: string, checked: boolean) => onChange(field, checked ? "true" : "");
  return (
    <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Uniform checklist</p>
        <h4 className="mt-1 text-lg font-semibold">Record each uniform item digitally</h4>
        <p className="mt-1 text-sm text-muted-foreground">Mark every item received or returned. Your selections become part of the official company record.</p>
      </div>
      <label className="flex items-center gap-3 rounded-xl border bg-background p-4">
        <Checkbox checked={fields.uniformNone === "true"} onCheckedChange={(value) => toggle("uniformNone", Boolean(value))} />
        <span className="text-sm font-medium">No uniform items were issued</span>
      </label>
      <div className="overflow-hidden rounded-xl border bg-background">
        <div className="grid grid-cols-[1fr_92px_92px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold"><span>Item</span><span>Received</span><span>Returned</span></div>
        {uniformChecklistRows.map((label, index) => (
          <div key={label} className="grid grid-cols-[1fr_92px_92px] items-center gap-2 border-b px-3 py-3 last:border-b-0">
            <span className="text-sm">{label}</span>
            <Checkbox aria-label={`${label} received`} checked={fields[`uniformReceived:${index}`] === "true"} onCheckedChange={(value) => toggle(`uniformReceived:${index}`, Boolean(value))} />
            <Checkbox aria-label={`${label} returned`} checked={fields[`uniformReturned:${index}`] === "true"} onCheckedChange={(value) => toggle(`uniformReturned:${index}`, Boolean(value))} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ScheduleDocumentFields({ data }: { data: OnboardingData }) {
  const address = [data.worksiteAddress, data.worksiteCity, data.worksiteState, data.worksiteZip].filter(Boolean).join(", ");
  return (
    <section className="space-y-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Company-provided assignment</p>
        <h4 className="mt-1 text-lg font-semibold">Your offer already supplies this schedule</h4>
        <p className="mt-1 text-sm text-muted-foreground">The officer cannot change these terms here. The worksite, start date, and expected schedule come directly from the accepted company offer.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">Worksite</p><p className="font-semibold">{data.scheduledPost || "Not provided"}</p></div>
        <div className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">Start date</p><p className="font-semibold">{data.startDate || "Not provided"}</p></div>
        <div className="rounded-xl border bg-background p-4 sm:col-span-2"><p className="text-xs text-muted-foreground">Complete worksite address</p><p className="font-semibold">{address || "Not provided"}</p></div>
        <div className="rounded-xl border bg-background p-4 sm:col-span-2"><p className="text-xs text-muted-foreground">Expected schedule</p><p className="font-semibold">{data.scheduledShift || "Not provided"}</p></div>
      </div>
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

function DigitalPolicyContent({ title, content }: { title: string; content?: { intro: string; paragraphs?: string[]; bullets?: string[] } }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
      <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><FileCheck2 className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Policy terms</p><h4 className="mt-1 text-xl font-bold">{title}</h4></div></div>
      <p className="mt-5 text-sm font-medium leading-6 text-foreground">{content?.intro || "Review the information requested below and confirm that it is accurate."}</p>
      {content?.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-4 text-sm leading-6 text-muted-foreground">{paragraph}</p>)}
      {content?.bullets && <ul className="mt-4 space-y-3">{content.bullets.map((item) => <li key={item} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" /><span>{item}</span></li>)}</ul>}
    </section>
  );
}
