import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SignaturePad } from "./SignaturePad";
import { toast } from "sonner";
import { BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, DollarSign, Eye, FileSignature, MapPin, ShieldCheck, XCircle, type LucideIcon } from "lucide-react";
import { employmentTypeLabel, payFrequencyLabel, type EmploymentOfferTerms } from "@/lib/employmentOffer";

const readableDate = (value: string) => {
  if (!value) return "Not provided";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const meaningful = (value?: string) => Boolean(value?.trim() && value.trim().toLowerCase() !== "none");

export function OfficerOfferReview({ offer, officerName, onChanged }: { offer: any; officerName: string; onChanged: () => void }) {
  const terms = offer.terms as EmploymentOfferTerms;
  const [pdfUrl, setPdfUrl] = useState("");
  const [viewed, setViewed] = useState(Boolean(offer.viewed_at));
  const [printedName, setPrintedName] = useState(officerName || "");
  const [signature, setSignature] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("manage-employment-offer", { body: { action, offer_id: offer.id, ...extra } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const viewPdf = async () => {
    setBusy(true);
    try {
      const data = await invoke("preview");
      setPdfUrl(data.url);
      setViewed(true);
      toast.success("Offer viewed — acceptance is now unlocked");
    } catch (e: any) {
      toast.error(e.message || "Offer could not be opened");
    } finally {
      setBusy(false);
    }
  };
  const accept = async () => {
    if (!viewed || !confirmed || !printedName.trim() || !signature) {
      toast.error("View the PDF, confirm the terms, and sign before accepting");
      return;
    }
    setBusy(true);
    try {
      await invoke("accept", { printed_name: printedName.trim(), signature });
      toast.success("Offer accepted. Employee onboarding is now unlocked.");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Offer could not be accepted");
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => {
    if (!window.confirm("Decline this employment offer? Employee onboarding will remain locked.")) return;
    setBusy(true);
    try {
      await invoke("decline");
      toast.success("Offer declined. The company can see your decision.");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Offer could not be declined");
    } finally {
      setBusy(false);
    }
  };

  const location = [terms.worksiteName, terms.worksiteAddress, terms.worksiteCity, terms.worksiteState, terms.worksiteZip].filter(Boolean).join(", ");
  const contingencies = [
    terms.backgroundCheckRequired && "Background check",
    terms.drugTestRequired && "Drug screening",
    terms.licenseVerificationRequired && "License verification",
    terms.workAuthorizationRequired && "Work authorization verification",
    meaningful(terms.otherContingencies) && terms.otherContingencies,
  ].filter(Boolean) as string[];
  const additionalPay = [
    meaningful(terms.shiftDifferential) && `Shift differential: ${terms.shiftDifferential}`,
    meaningful(terms.bonusCompensation) && `Bonus: ${terms.bonusCompensation}`,
    meaningful(terms.additionalCompensation) && `Other compensation: ${terms.additionalCompensation}`,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Card className="overflow-hidden border-primary/25 shadow-sm">
        <div className="bg-gradient-to-br from-primary/10 via-background to-amber-50 px-6 py-7 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Employment offer</p>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Your employment offer</h1>
              <p className="mt-3 text-base leading-7 text-muted-foreground">Review the key terms below, then open the company-signed offer document. Nothing is final until you choose to accept and add your signature.</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800"><ShieldCheck className="h-4 w-4" />Company signed - awaiting your decision</div>
            </div>
            <Badge variant="outline" className="bg-background/80 px-3 py-1">Offer version {offer.version}</Badge>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary icon={DollarSign} label="Hourly pay" value={`$${Number(terms.hourlyRate).toFixed(2)}/hour`} />
            <Summary icon={CalendarDays} label="Proposed start" value={readableDate(terms.startDate)} />
            <Summary icon={Clock3} label="Expected hours" value={`${terms.expectedWeeklyHours} hours/week`} />
            <Summary icon={MapPin} label="Primary worksite" value={terms.worksiteName || `${terms.worksiteCity}, ${terms.worksiteState}`} />
          </div>
        </div>

        <CardContent className="space-y-7 p-6 sm:p-8">
          <OfferSection icon={BriefcaseBusiness} title="The role" description={`A ${employmentTypeLabel(terms.employmentType).toLowerCase()} ${terms.positionTitle} position reporting to ${terms.supervisorName}.`} tone="blue">
            <Detail label="What you will do" value={terms.duties} />
            <Detail label="Schedule" value={`${terms.expectedSchedule}. The company expects approximately ${terms.expectedWeeklyHours} hours each week; hours are ${terms.hoursType === "guaranteed" ? "guaranteed" : "variable and not guaranteed"}.`} />
            <Detail label="Where you will work" value={location} />
          </OfferSection>

          <OfferSection icon={DollarSign} title="Pay and benefits" description={`$${Number(terms.hourlyRate).toFixed(2)} per hour, paid ${payFrequencyLabel(terms.payFrequency).toLowerCase()}. Regular payday: ${terms.regularPayday}.`} tone="green">
            <Detail label="Overtime" value={terms.overtimeTerms} />
            {additionalPay.length > 0 && <Detail label="Additional compensation" value={additionalPay.join(" • ")} />}
            <Detail label="Benefits" value={terms.benefitsEligibility === "eligible" ? `${terms.benefitsSummary}${terms.benefitsEffectiveDate ? ` Effective ${readableDate(terms.benefitsEffectiveDate)}.` : ""}` : "This position is not eligible for company benefits."} />
            <Detail label="Time off and holidays" value={`PTO: ${terms.ptoSummary}. Holidays: ${terms.holidaySummary}.`} />
          </OfferSection>

          <OfferSection icon={ShieldCheck} title="Before you start" description={contingencies.length ? "This offer depends on successful completion of the items below." : "The company listed no pre-employment contingencies."} tone="amber">
            {contingencies.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">{contingencies.map((item) => <li key={item} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{item}</span></li>)}</ul>}
            {meaningful(terms.specialTerms) && <Detail label="Special terms" value={terms.specialTerms} />}
          </OfferSection>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
            <h2 className="font-semibold text-foreground">Important before you decide</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">This is at-will employment with no guaranteed duration. Either you or the company may end employment at any time, subject to applicable law.</p>
            <p className="mt-2 text-sm font-medium text-foreground">Please respond by {readableDate(terms.acceptanceDeadline)}.</p>
            <p className="mt-1 text-xs text-muted-foreground">Prepared and signed by {terms.representativeName}, {terms.representativeTitle}. Policies referenced: {terms.policyReferences}.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5" />Review the signed offer</CardTitle><CardDescription>Open the official company-signed PDF and compare it with the summary above before making your decision.</CardDescription></CardHeader>
        <CardContent className="space-y-4"><Button type="button" onClick={viewPdf} disabled={busy}>{viewed ? "Open signed offer again" : "Open signed offer"}</Button>{pdfUrl && <iframe title="Employment offer PDF" src={pdfUrl} className="h-[60vh] min-h-[420px] w-full rounded-xl border bg-white" />}{viewed && <p className="flex items-center gap-2 text-sm font-medium text-green-700"><CheckCircle2 className="h-4 w-4" />Signed offer reviewed</p>}</CardContent>
      </Card>

      <Card className={!viewed ? "opacity-60" : "border-green-200"}>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5" />Your decision</CardTitle><CardDescription>Accepting adds your signature to an immutable copy of this exact offer. Declining keeps employee onboarding locked.</CardDescription></CardHeader>
        <CardContent className="space-y-5"><div className="space-y-2"><Label htmlFor="offer-printed-name">Printed legal name *</Label><Input id="offer-printed-name" value={printedName} onChange={(e) => setPrintedName(e.target.value)} disabled={!viewed} /></div><SignaturePad value={signature} suggestedName={printedName} onChange={setSignature} /><label className="flex items-start gap-3 rounded-xl border p-4"><Checkbox disabled={!viewed} checked={confirmed} onCheckedChange={(v) => setConfirmed(Boolean(v))} /><span className="text-sm">I reviewed the complete signed offer, understand the terms summarized above, and accept this offer of employment.</span></label><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button variant="destructive" onClick={decline} disabled={busy}><XCircle className="mr-2 h-4 w-4" />Decline offer</Button><Button onClick={accept} disabled={busy || !viewed}>{busy ? "Saving securely…" : "Accept and sign offer"}</Button></div></CardContent>
      </Card>
    </div>
  );
}

function Summary({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="rounded-xl border bg-background/85 p-4 shadow-sm"><Icon className="mb-3 h-5 w-5 text-primary" /><span className="block text-xs font-medium text-muted-foreground">{label}</span><strong className="mt-1 block text-sm leading-5 text-foreground">{value}</strong></div>;
}

function OfferSection({ icon: Icon, title, description, tone, children }: { icon: LucideIcon; title: string; description: string; tone: "blue" | "green" | "amber"; children: ReactNode }) {
  const colors = {
    blue: "border-blue-200 bg-blue-50/55 [&_.offer-icon]:bg-blue-600",
    green: "border-emerald-200 bg-emerald-50/55 [&_.offer-icon]:bg-emerald-600",
    amber: "border-amber-200 bg-amber-50/55 [&_.offer-icon]:bg-amber-600",
  }[tone];
  return <section className={`rounded-2xl border p-5 sm:p-6 ${colors}`}><div className="mb-5 flex items-start gap-4"><div className="offer-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"><Icon className="h-5 w-5" /></div><div><h2 className="text-lg font-bold text-foreground">{title}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div></div><div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{children}</div></section>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-white/90 p-4 shadow-sm"><h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</h3><p className="mt-1.5 whitespace-pre-wrap text-sm font-semibold leading-6 text-foreground">{value || "Not provided"}</p></div>;
}
