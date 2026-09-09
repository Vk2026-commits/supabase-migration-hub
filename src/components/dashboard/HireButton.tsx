import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Briefcase, FileCheck2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { SignaturePad } from "./SignaturePad";
import { emptyEmploymentOffer, validateEmploymentOffer, type EmploymentOfferTerms } from "@/lib/employmentOffer";

interface HireButtonProps { officerId: string; officerName: string; companyId: string; hiringApplicationId?: string | null; jobApplicationId?: string | null; jobTitle?: string; onChanged?: () => void; }

const HireButton = ({ officerId, officerName, companyId, hiringApplicationId, jobApplicationId, jobTitle, onChanged }: HireButtonProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [terms, setTerms] = useState<EmploymentOfferTerms>(() => emptyEmploymentOffer(jobTitle));
  const [companySignature, setCompanySignature] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [previousOffer, setPreviousOffer] = useState<any>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const update = <K extends keyof EmploymentOfferTerms>(key: K, value: EmploymentOfferTerms[K]) => setTerms((current) => ({ ...current, [key]: value }));

  const prepareDialog = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setInitializing(true);
    try {
      const [{ data: company }, { data: previous }] = await Promise.all([
        supabase.from("company_profiles").select("company_name,contact_person_name,contact_person_title,company_address,company_city,company_state,company_zip").eq("id", companyId).maybeSingle(),
        (supabase as any).from("employment_offers").select("id,version,status,terms").eq("company_id", companyId).eq("officer_id", officerId).order("version", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const base = previous?.terms ? { ...emptyEmploymentOffer(jobTitle), ...previous.terms } : emptyEmploymentOffer(jobTitle);
      setPreviousOffer(previous || null);
      setTerms({ ...base, positionTitle: base.positionTitle || jobTitle || "Security Officer", worksiteName: base.worksiteName || company?.company_name || "", worksiteAddress: base.worksiteAddress || company?.company_address || "", worksiteCity: base.worksiteCity || company?.company_city || "", worksiteState: base.worksiteState || company?.company_state || "Texas", worksiteZip: base.worksiteZip || company?.company_zip || "", representativeName: base.representativeName || company?.contact_person_name || "", representativeTitle: base.representativeTitle || company?.contact_person_title || "Authorized Hiring Representative" });
      setAuthorized(false); setCompanySignature(""); setIdempotencyKey(crypto.randomUUID());
    } finally { setInitializing(false); }
  };

  const sendOffer = async () => {
    const validation = validateEmploymentOffer(terms);
    if (!validation.valid || !authorized || !companySignature) { toast.error(validation.missing.length ? "Complete every required offer field" : !companySignature ? "Add the hiring representative's signature" : "Authorize the offer before sending"); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-employment-offer", { body: { action: "send", company_id: companyId, officer_id: officerId, hiring_application_id: hiringApplicationId, job_application_id: jobApplicationId, terms, company_signature: companySignature, idempotency_key: idempotencyKey } });
      if (error) throw error; if (data?.error) throw new Error(data.error);
      toast.success(`Offer sent to ${officerName}. Onboarding unlocks only after acceptance.`); setOpen(false); onChanged?.();
    } catch (error: any) { toast.error(error?.message || "The offer could not be securely generated and sent"); } finally { setLoading(false); }
  };
  const offerAction = async (action: "preview" | "withdraw") => {
    if (!previousOffer?.id) return;
    const { data, error } = await supabase.functions.invoke("manage-employment-offer", { body: { action, offer_id: previousOffer.id } });
    if (error || data?.error) { toast.error(data?.error || `Offer could not be ${action === "preview" ? "opened" : "withdrawn"}`); return; }
    if (action === "preview") window.open(data.url, "_blank", "noopener,noreferrer");
    else { toast.success("Offer withdrawn"); setPreviousOffer({ ...previousOffer, status: "withdrawn" }); onChanged?.(); }
  };

  const field = (label: string, key: keyof EmploymentOfferTerms, placeholder = "", type = "text") => <div className="space-y-2"><Label htmlFor={`offer-${key}`}>{label} *</Label><Input id={`offer-${key}`} type={type} value={String(terms[key] ?? "")} onChange={(e) => update(key as any, e.target.value as any)} placeholder={placeholder} /></div>;
  const area = (label: string, key: keyof EmploymentOfferTerms, placeholder = "") => <div className="space-y-2"><Label htmlFor={`offer-${key}`}>{label} *</Label><Textarea id={`offer-${key}`} value={String(terms[key] ?? "")} onChange={(e) => update(key as any, e.target.value as any)} placeholder={placeholder} /></div>;

  return <Dialog open={open} onOpenChange={prepareDialog}>
    <DialogTrigger asChild><Button className="w-full sm:w-auto"><Briefcase className="mr-2 h-4 w-4" />Send Offer</Button></DialogTrigger>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Prepare complete hourly employment offer</DialogTitle><DialogDescription>The exact terms below are archived in a company-signed PDF. Sending does not mark {officerName} as hired.</DialogDescription></DialogHeader>
      {initializing ? <p className="py-10 text-center text-muted-foreground">Loading offer details…</p> : <div className="space-y-7 py-2">
        {previousOffer && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4"><div><strong className="block">Latest offer: version {previousOffer.version}</strong><span className="text-sm capitalize text-muted-foreground">Status: {String(previousOffer.status).replace(/_/g, " ")}</span></div><div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => offerAction("preview")}>View PDF</Button>{["sent","viewed"].includes(previousOffer.status) && <Button type="button" size="sm" variant="destructive" onClick={() => offerAction("withdraw")}>Withdraw</Button>}</div></div>}
        <section className="space-y-4 rounded-2xl border p-4"><h3 className="font-semibold">Role and classification</h3><div className="grid gap-4 sm:grid-cols-2">{field("Position", "positionTitle", "Security Officer")}<Choice label="Employment type" value={terms.employmentType} onChange={(v) => update("employmentType", v as any)} options={[["full_time","Full-time"],["part_time","Part-time"],["temporary","Temporary"],["seasonal","Seasonal"]]} /><Choice label="Overtime classification" value={terms.classification} onChange={(v) => update("classification", v as any)} options={[["nonexempt","Nonexempt — overtime eligible"],["exempt","Exempt"]]} /></div>{area("Duties and responsibilities", "duties", "Describe the role's primary duties")}</section>
        <section className="space-y-4 rounded-2xl border p-4"><h3 className="font-semibold">Pay and compensation</h3><div className="grid gap-4 sm:grid-cols-2">{field("Hourly rate ($)", "hourlyRate", "18.00", "number")}<Choice label="Pay frequency" value={terms.payFrequency} onChange={(v) => update("payFrequency", v as any)} options={[["biweekly","Every two weeks"],["semimonthly","Twice per month"]]} />{field("Regular payday", "regularPayday", "Every other Friday")}{field("Shift differential", "shiftDifferential", "None")}{field("Bonus", "bonusCompensation", "None")}{field("Additional compensation", "additionalCompensation", "None")}</div>{area("Overtime terms", "overtimeTerms")}</section>
        <section className="space-y-4 rounded-2xl border p-4"><h3 className="font-semibold">Worksite and schedule</h3><div className="grid gap-4 sm:grid-cols-2">{field("Worksite name", "worksiteName")}{field("Street address", "worksiteAddress")}{field("City", "worksiteCity")}{field("State", "worksiteState")}{field("ZIP code", "worksiteZip")}{field("Supervisor", "supervisorName")}{field("Expected weekly hours", "expectedWeeklyHours", "40", "number")}<Choice label="Hours" value={terms.hoursType} onChange={(v) => update("hoursType", v as any)} options={[["guaranteed","Guaranteed"],["variable","Variable / not guaranteed"]]} /></div>{area("Expected schedule", "expectedSchedule", "Days, start/end times, and shift expectations")}</section>
        <section className="space-y-4 rounded-2xl border p-4"><h3 className="font-semibold">Benefits and policies</h3><div className="grid gap-4 sm:grid-cols-2"><Choice label="Benefits eligibility" value={terms.benefitsEligibility} onChange={(v) => update("benefitsEligibility", v as any)} options={[["eligible","Eligible"],["not_eligible","Not eligible"]]} />{terms.benefitsEligibility === "eligible" && <DatePicker id="benefits-effective" label="Benefits effective date *" value={terms.benefitsEffectiveDate} onChange={(v) => update("benefitsEffectiveDate", v)} />}{field("Benefits", "benefitsSummary", "Not eligible")}{field("PTO", "ptoSummary", "None")}{field("Paid holidays", "holidaySummary", "None")}{field("Applicable policies", "policyReferences")}</div></section>
        <section className="space-y-4 rounded-2xl border p-4"><h3 className="font-semibold">Dates and contingencies</h3><div className="grid gap-4 sm:grid-cols-2"><DatePicker id="offer-start" label="Start date *" value={terms.startDate} onChange={(v) => update("startDate", v)} /><DatePicker id="offer-deadline" label="Acceptance deadline *" value={terms.acceptanceDeadline} onChange={(v) => update("acceptanceDeadline", v)} /></div><div className="grid gap-2 sm:grid-cols-2">{[["backgroundCheckRequired","Background check"],["drugTestRequired","Drug test"],["licenseVerificationRequired","License verification"],["workAuthorizationRequired","Work authorization verification"]].map(([key,label]) => <label key={key} className="flex items-center gap-2 rounded-xl border p-3 text-sm"><Checkbox checked={Boolean(terms[key as keyof EmploymentOfferTerms])} onCheckedChange={(v) => update(key as any, Boolean(v))} />{label}</label>)}</div>{area("Other contingencies", "otherContingencies", "None")}{area("Special terms", "specialTerms", "None")}<label className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4"><Checkbox checked={terms.atWillAcknowledged} onCheckedChange={(v) => update("atWillAcknowledged", Boolean(v))} /><span className="text-sm"><strong className="block">At-will employment notice *</strong>Employment may be ended by either party at any time, with or without cause or advance notice, subject to applicable law.</span></label></section>
        <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-4"><h3 className="flex items-center gap-2 font-semibold"><FileCheck2 className="h-5 w-5 text-primary" />Company authorization</h3><div className="grid gap-4 sm:grid-cols-2">{field("Hiring representative", "representativeName")}{field("Representative title", "representativeTitle")}</div><SignaturePad value={companySignature} suggestedName={terms.representativeName} onChange={setCompanySignature} /><label className="flex items-start gap-3 rounded-xl border bg-background p-4"><Checkbox checked={authorized} onCheckedChange={(v) => setAuthorized(Boolean(v))} /><span className="text-sm"><strong className="block">I am authorized to make this offer *</strong>I confirm the terms are complete and accurate and adopt the signature above on behalf of the company.</span></label></section>
      </div>}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={sendOffer} disabled={loading || initializing || ["accepted","legacy_accepted"].includes(previousOffer?.status)}>{loading ? "Generating and archiving…" : ["accepted","legacy_accepted"].includes(previousOffer?.status) ? "Offer already accepted" : previousOffer ? "Sign and send revised offer" : "Sign and send offer"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
};

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <div className="space-y-2"><Label>{label} *</Label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options.map(([key, text]) => <SelectItem key={key} value={key}>{text}</SelectItem>)}</SelectContent></Select></div>; }

export default HireButton;
