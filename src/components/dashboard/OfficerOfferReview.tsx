import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SignaturePad } from "./SignaturePad";
import { toast } from "sonner";
import { CheckCircle2, Eye, FileSignature, XCircle } from "lucide-react";
import { employmentTypeLabel, payFrequencyLabel, type EmploymentOfferTerms } from "@/lib/employmentOffer";

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
    if (error) throw error; if (data?.error) throw new Error(data.error); return data;
  };
  const viewPdf = async () => { setBusy(true); try { const data = await invoke("preview"); setPdfUrl(data.url); setViewed(true); toast.success("Offer viewed — acceptance is now unlocked"); } catch (e: any) { toast.error(e.message || "Offer could not be opened"); } finally { setBusy(false); } };
  const accept = async () => { if (!viewed || !confirmed || !printedName.trim() || !signature) { toast.error("View the PDF, confirm the terms, and sign before accepting"); return; } setBusy(true); try { await invoke("accept", { printed_name: printedName.trim(), signature }); toast.success("Offer accepted. Employee onboarding is now unlocked."); onChanged(); } catch (e: any) { toast.error(e.message || "Offer could not be accepted"); } finally { setBusy(false); } };
  const decline = async () => { if (!window.confirm("Decline this employment offer? Employee onboarding will remain locked.")) return; setBusy(true); try { await invoke("decline"); toast.success("Offer declined. The company can see your decision."); onChanged(); } catch (e: any) { toast.error(e.message || "Offer could not be declined"); } finally { setBusy(false); } };

  const rows: Array<[string, string]> = [["Position",terms.positionTitle],["Duties",terms.duties],["Employment",`${employmentTypeLabel(terms.employmentType)}, ${terms.classification}`],["Pay",`$${Number(terms.hourlyRate).toFixed(2)}/hour · ${payFrequencyLabel(terms.payFrequency)} · ${terms.regularPayday}`],["Overtime",terms.overtimeTerms],["Additional pay",`Differential: ${terms.shiftDifferential}; Bonus: ${terms.bonusCompensation}; Other: ${terms.additionalCompensation}`],["Worksite",`${terms.worksiteName}, ${terms.worksiteAddress}, ${terms.worksiteCity}, ${terms.worksiteState} ${terms.worksiteZip}`],["Supervisor",terms.supervisorName],["Schedule",`${terms.expectedSchedule}; ${terms.expectedWeeklyHours} hours/week (${terms.hoursType})`],["Benefits",`${terms.benefitsSummary}; PTO: ${terms.ptoSummary}; Holidays: ${terms.holidaySummary}`],["Start / accept by",`${terms.startDate} / ${terms.acceptanceDeadline}`],["Contingencies",[terms.backgroundCheckRequired&&"background check",terms.drugTestRequired&&"drug test",terms.licenseVerificationRequired&&"license verification",terms.workAuthorizationRequired&&"work authorization",terms.otherContingencies].filter(Boolean).join(", ")],["Special terms",terms.specialTerms]];

  return <div className="mx-auto max-w-4xl space-y-5"><Card className="border-primary/30"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-2xl">Employment offer</CardTitle><CardDescription>Review the exact company-signed terms before employee onboarding.</CardDescription></div><Badge>Version {offer.version}</Badge></div></CardHeader><CardContent><dl className="grid gap-3 sm:grid-cols-2">{rows.map(([label,value]) => <div key={label} className="rounded-xl border p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm">{value || "None"}</dd></div>)}</dl></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5" />View the full offer document</CardTitle><CardDescription>You must open the archived PDF before you can accept.</CardDescription></CardHeader><CardContent className="space-y-4"><Button type="button" onClick={viewPdf} disabled={busy}>{viewed ? "View offer PDF again" : "View offer PDF"}</Button>{pdfUrl && <iframe title="Employment offer PDF" src={pdfUrl} className="h-[60vh] min-h-[420px] w-full rounded-xl border bg-white" />}{viewed && <p className="flex items-center gap-2 text-sm font-medium text-green-700"><CheckCircle2 className="h-4 w-4" />Document viewed</p>}</CardContent></Card>
    <Card className={!viewed ? "opacity-60" : "border-green-200"}><CardHeader><CardTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5" />Accept and sign</CardTitle><CardDescription>Your signature creates an immutable, fully accepted offer PDF.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2"><Label htmlFor="offer-printed-name">Printed legal name *</Label><Input id="offer-printed-name" value={printedName} onChange={(e)=>setPrintedName(e.target.value)} disabled={!viewed} /></div><SignaturePad value={signature} suggestedName={printedName} onChange={setSignature} /><label className="flex items-start gap-3 rounded-xl border p-4"><Checkbox disabled={!viewed} checked={confirmed} onCheckedChange={(v)=>setConfirmed(Boolean(v))} /><span className="text-sm">I reviewed the complete offer PDF, understand the terms, and accept this offer of employment.</span></label><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button variant="destructive" onClick={decline} disabled={busy}><XCircle className="mr-2 h-4 w-4" />Decline offer</Button><Button onClick={accept} disabled={busy || !viewed}>{busy ? "Saving securely…" : "Accept offer"}</Button></div></CardContent></Card></div>;
}
