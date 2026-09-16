import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Star, Calendar, CheckCircle, Clock, Eye, FileCheck2, ClipboardCheck, Download, Archive, Loader2, ChevronDown, Plus, Search, UsersRound } from "lucide-react";
import EvaluationForm from "./EvaluationForm";
import { createZip } from "@/lib/createZip";

interface EmploymentTrackingProps {
  companyId: string;
}

const EmploymentTracking = ({ companyId }: EmploymentTrackingProps) => {
  const [hires, setHires] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvaluation, setSelectedEvaluation] = useState<any>(null);
  const [selectedHire, setSelectedHire] = useState<string>("");
  const [updateType, setUpdateType] = useState("performance_review");
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(5);
  const [complianceHire, setComplianceHire] = useState<any>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [downloadingDocuments, setDownloadingDocuments] = useState(false);
  const [downloadingOfferId, setDownloadingOfferId] = useState<string | null>(null);
  const [expandedHireId, setExpandedHireId] = useState<string | null>(null);
  const [showManualUpdate, setShowManualUpdate] = useState(false);
  const [hireSearch, setHireSearch] = useState("");
  const [complianceDocuments, setComplianceDocuments] = useState<Array<{ id: string; label: string; version: number | null; submittedAt: string; sha256: string | null; url: string; filename: string }>>([]);

  useEffect(() => {
    void loadHires();
    const refresh = window.setInterval(() => void loadHires(), 15000);
    return () => window.clearInterval(refresh);
  }, [companyId]);

  const loadHires = async () => {
    try {
      const { data, error } = await supabase
        .from("hires")
        .select(`
          *,
          officer_profiles(*, profiles(full_name)),
          company_profiles(company_name,contact_person_name,contact_person_title),
          evaluations(*),
          employment_updates(*)
        `)
        .eq("company_id", companyId)
        .not("employment_confirmed_at", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const progressResult = await (supabase as any).rpc("get_company_onboarding_progress", { _company_id: companyId });
      if (progressResult.error) throw progressResult.error;
      const progressByHire = new Map((progressResult.data || []).map((entry: any) => [entry.hire_id, entry]));
      setHires((data || []).map((hire: any) => ({ ...hire, onboarding_progress: progressByHire.get(hire.id) || null })));
    } catch (error) {
      console.error("Error loading hires:", error);
      toast.error("Failed to load employment data");
    } finally {
      setLoading(false);
    }
  };

  const openAcceptedOffer = async (hire: any) => {
    if (!hire.offer_id) { toast.info("This is a legacy hire without captured offer evidence"); return; }
    const { data, error } = await supabase.functions.invoke("manage-employment-offer", { body: { action: "preview", offer_id: hire.offer_id } });
    if (error || data?.error || !data?.url) { toast.error(data?.error || "The accepted offer could not be opened"); return; }
    window.open(data.url, "_blank", "noopener,noreferrer");
  };

  const downloadAcceptedOffer = async (hire: any) => {
    if (!hire.offer_id) { toast.info("This is a legacy hire without captured offer evidence"); return; }
    setDownloadingOfferId(hire.offer_id);
    try {
      const { data, error } = await supabase.functions.invoke("manage-employment-offer", { body: { action: "preview", offer_id: hire.offer_id } });
      if (error || data?.error || !data?.url) throw new Error(data?.error || "The accepted offer could not be downloaded");
      const response = await fetch(data.url);
      if (!response.ok) throw new Error("The accepted offer could not be downloaded");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      const officerName = hire.officer_profiles?.profiles?.full_name || "officer";
      link.href = url;
      link.download = `${officerName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}-accepted-offer.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Accepted offer downloaded");
    } catch (error: any) {
      toast.error(error.message || "The accepted offer could not be downloaded");
    } finally {
      setDownloadingOfferId(null);
    }
  };

  const openComplianceFile = async (hire: any) => {
    setComplianceHire(hire);
    setComplianceLoading(true);
    setComplianceDocuments([]);
    try {
      const packetId = hire.onboarding_progress?.packet_id;
      if (!packetId) throw new Error("This officer does not have an onboarding packet yet");
      const [result, packetResult] = await Promise.all([
        (supabase as any).from("officer_compliance_documents").select("id,document_label,version,submitted_at,sha256,storage_path,document_type").eq("packet_id", packetId).order("submitted_at", { ascending: false }),
        (supabase as any).from("officer_onboarding_packets").select("id,i9_document_path,i9_submitted_at,w4_document_path,w4_submitted_at").eq("id", packetId).maybeSingle(),
      ]);
      if (result.error) throw result.error;
      if (packetResult.error) throw packetResult.error;
      const entries = (result.data || []).map((document: any) => ({ ...document, legacy: false }));
      if (!entries.some((document: any) => document.document_type === "form-i9") && packetResult.data?.i9_document_path && packetResult.data?.i9_submitted_at) entries.push({ id: `legacy-i9-${packetId}`, document_label: "Signed Form I-9", version: null, submitted_at: packetResult.data.i9_submitted_at, sha256: null, storage_path: packetResult.data.i9_document_path, document_type: "form-i9", legacy: true });
      if (!entries.some((document: any) => document.document_type === "form-w4") && packetResult.data?.w4_document_path && packetResult.data?.w4_submitted_at) entries.push({ id: `legacy-w4-${packetId}`, document_label: "Signed Form W-4", version: null, submitted_at: packetResult.data.w4_submitted_at, sha256: null, storage_path: packetResult.data.w4_document_path, document_type: "form-w4", legacy: true });
      const paths = entries.map((document: any) => document.storage_path);
      const signedResult = paths.length ? await supabase.storage.from("onboarding-documents").createSignedUrls(paths, 3600) : { data: [], error: null };
      if (signedResult.error) throw signedResult.error;
      const urls = new Map((signedResult.data || []).map((item: any) => [item.path, item.signedUrl]));
      const documents = (await Promise.all(entries.map(async (document: any) => {
        await (supabase as any).rpc("log_sensitive_access", { _action: "view", _table_name: "officer_compliance_documents", _record_id: document.id, _details: { document_type: document.document_type, officer_id: hire.officer_id } });
        const url = urls.get(document.storage_path);
        if (!url) return null;
        return { id: document.id, label: document.document_label, version: document.version, submittedAt: document.submitted_at, sha256: document.sha256, url, filename: `${document.document_type}${document.version ? `-v${document.version}` : ""}.pdf` };
      }))).filter(Boolean);
      setComplianceDocuments(documents);
    } catch (error) {
      console.error("Compliance file failed to load", error);
      toast.error("The officer compliance file could not be loaded");
    } finally {
      setComplianceLoading(false);
    }
  };

  const downloadDocument = async (file: typeof complianceDocuments[number]) => {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`Could not download ${file.label}`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadAllDocuments = async () => {
    if (!complianceDocuments.length) return;
    setDownloadingDocuments(true);
    try {
      const files = await Promise.all(complianceDocuments.map(async (document) => {
        const response = await fetch(document.url);
        if (!response.ok) throw new Error(`Could not download ${document.label}`);
        return { name: document.filename, data: await response.blob() };
      }));
      const archive = await createZip(files);
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(complianceHire?.officer_profiles?.profiles?.full_name || "officer").replace(/[^a-z0-9]+/gi, "-")}-onboarding-documents.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Onboarding documents downloaded");
    } catch (error: any) {
      toast.error(error.message || "The onboarding documents could not be downloaded");
    } finally {
      setDownloadingDocuments(false);
    }
  };

  const periodNames: Record<string, string> = {
    '30_day': '30-Day',
    '90_day': '90-Day',
    '1_year': '1-Year'
  };

  const getEvaluationStatus = (evaluation: any) => {
    if (evaluation.completed_date) {
      return { label: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle };
    }
    if (evaluation.sent_date) {
      return { label: "Sent", color: "bg-blue-100 text-blue-800", icon: Clock };
    }
    if (new Date(evaluation.due_date) < new Date()) {
      return { label: "Overdue", color: "bg-red-100 text-red-800", icon: Calendar };
    }
    return { label: "Pending", color: "bg-gray-100 text-gray-800", icon: Calendar };
  };

  const onboardingSteps = ["Offer accepted", "Form I-9", "Form W-4", "Pay setup", "Emergency contact", "Company policies", "Uniform and schedule", "Review and sign"];
  const onboardingStatus = (hire: any) => {
    const progress = hire.onboarding_progress;
    if (!progress || progress.status === "not_started") return { label: "Onboarding not started", detail: "The officer accepted the offer but has not started the onboarding packet.", percent: 0 };
    if (progress.status === "submitted") return { label: "Onboarding complete", detail: "The complete onboarding packet has been submitted.", percent: 100 };
    const step = Math.max(0, Math.min(7, Number(progress.current_step || 0)));
    return { label: `Onboarding: step ${step + 1} of 8`, detail: onboardingSteps[step], percent: Math.round(((step + 1) / 8) * 100) };
  };

  const handleSubmitUpdate = async () => {
    if (!selectedHire) {
      toast.error("Please select an employee");
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in");
        return;
      }

      const { error } = await supabase.from("employment_updates").insert({
        hire_id: selectedHire,
        update_type: updateType,
        notes,
        rating: updateType === "performance_review" ? rating : null,
        created_by_user_id: session.user.id,
      });

      if (error) throw error;

      toast.success("Employment update recorded");
      setNotes("");
      setRating(5);
      setSelectedHire("");
      setShowManualUpdate(false);
      loadHires();
    } catch (error) {
      console.error("Error submitting update:", error);
      toast.error("Failed to submit update");
    }
  };

  if (loading) {
    return <div>Loading employment tracking...</div>;
  }

  if (selectedEvaluation) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => setSelectedEvaluation(null)}>
          ← Back to Hires
        </Button>
        <EvaluationForm 
          evaluation={selectedEvaluation} 
          onComplete={() => {
            setSelectedEvaluation(null);
            loadHires();
          }}
        />
      </div>
    );
  }

  const filteredHires = hires.filter((hire) => {
    const search = hireSearch.trim().toLowerCase();
    if (!search) return true;
    return [hire.officer_profiles?.profiles?.full_name, hire.position_title, hire.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">Hired officers</h2>
            <Badge variant="secondary">{hires.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">A compact roster with employment records and upcoming evaluations.</p>
        </div>
        <Button onClick={() => setShowManualUpdate(true)}><Plus className="mr-2 h-4 w-4" />Add update</Button>
      </div>

      {hires.length > 4 && <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={hireSearch} onChange={(event) => setHireSearch(event.target.value)} placeholder="Search hired officers" /></div>}

      <div className="space-y-2">
        {filteredHires.map((hire) => {
          const onboarding = onboardingStatus(hire);
          const evaluations = [...(hire.evaluations || [])].sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
          const nextEvaluation = evaluations.find((evaluation: any) => !evaluation.completed_date);
          const name = hire.officer_profiles?.profiles?.full_name || "Unknown officer";
          const initials = name.split(/\s+/).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase();
          const expanded = expandedHireId === hire.id;
          return <Card key={hire.id} className={`overflow-hidden transition-shadow ${expanded ? "shadow-md ring-1 ring-primary/10" : "shadow-sm hover:shadow-md"}`}>
            <div className="flex items-center gap-2 p-3 sm:p-4">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setExpandedHireId(expanded ? null : hire.id)} aria-expanded={expanded}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary">{initials}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{name}</span><span className="block truncate text-xs text-muted-foreground">{hire.position_title || "Security Officer"} · Hired {new Date(hire.hire_date).toLocaleDateString()}</span></span>
                <span className="hidden items-center gap-2 md:flex"><Badge variant="outline" className={onboarding.percent === 100 ? "border-green-200 bg-green-50 text-green-800" : "border-blue-200 bg-blue-50 text-blue-800"}>{onboarding.percent === 100 ? "Onboarding complete" : `${onboarding.percent}% onboarding`}</Badge>{nextEvaluation ? <Badge variant="secondary">Next: {periodNames[nextEvaluation.evaluation_period]} · {new Date(nextEvaluation.due_date).toLocaleDateString()}</Badge> : <Badge variant="secondary">Evaluations complete</Badge>}</span>
              </button>
              <Badge variant={hire.status === "active" ? "default" : "secondary"} className="hidden capitalize sm:inline-flex">{hire.status}</Badge>
              <Button type="button" size="icon" variant="ghost" onClick={() => setExpandedHireId(expanded ? null : hire.id)} aria-label={expanded ? "Close employee details" : "Open employee details"}><ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} /></Button>
            </div>

            {expanded && <div className="space-y-4 border-t bg-muted/10 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border bg-background p-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-600" /><div><p className="text-sm font-semibold">Offer accepted</p><p className="text-xs text-muted-foreground">Signed offer retained with this hire</p></div></div>{hire.offer_id ? <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => void openAcceptedOffer(hire)}><Eye className="mr-1.5 h-4 w-4" />View</Button><Button size="sm" variant="ghost" onClick={() => void downloadAcceptedOffer(hire)} disabled={downloadingOfferId === hire.offer_id}><Download className="mr-1.5 h-4 w-4" />PDF</Button></div> : <Badge variant="secondary">Legacy</Badge>}</div></div>
                <div className="rounded-xl border bg-background p-3"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><ClipboardCheck className={`h-4 w-4 shrink-0 ${onboarding.percent === 100 ? "text-green-600" : "text-primary"}`} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{onboarding.label}</p><p className="truncate text-xs text-muted-foreground">{onboarding.detail}</p></div></div><Badge variant="outline">{onboarding.percent}%</Badge></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${onboarding.percent === 100 ? "bg-green-600" : "bg-primary"}`} style={{ width: `${onboarding.percent}%` }} /></div></div>
              </div>

              <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={!hire.onboarding_progress?.packet_id} onClick={() => void openComplianceFile(hire)}><FileCheck2 className="mr-2 h-4 w-4" />Onboarding documents</Button><Button type="button" size="sm" variant="outline" onClick={() => { setSelectedHire(hire.id); setShowManualUpdate(true); }}><Plus className="mr-2 h-4 w-4" />Add note or update</Button></div>

              {evaluations.length > 0 && <div><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Performance evaluations</h4><div className="grid gap-2 lg:grid-cols-3">{evaluations.map((evaluation: any) => { const status = getEvaluationStatus(evaluation); const StatusIcon = status.icon; return <div key={evaluation.id} className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3"><div className="flex min-w-0 items-center gap-2"><StatusIcon className="h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="text-sm font-medium">{periodNames[evaluation.evaluation_period]}</p><p className="text-xs text-muted-foreground">Due {new Date(evaluation.due_date).toLocaleDateString()}</p></div></div><div className="flex items-center gap-1"><Badge className={status.color}>{status.label}</Badge>{!evaluation.completed_date && <Button size="sm" variant="ghost" onClick={() => setSelectedEvaluation(evaluation)}>Open</Button>}</div></div>; })}</div></div>}

              {hire.employment_updates?.length > 0 && <div><h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Recent updates</h4><div className="grid gap-2 md:grid-cols-2">{hire.employment_updates.slice(0, 4).map((update: any) => <div key={update.id} className="rounded-lg border bg-background p-3 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-medium capitalize">{update.update_type.replace(/_/g, " ")}</span><span className="text-xs text-muted-foreground">{new Date(update.created_at).toLocaleDateString()}</span></div>{update.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{update.notes}</p>}</div>)}</div></div>}
            </div>}
          </Card>;
        })}
        {hires.length === 0 && <Card className="border-dashed"><CardContent className="flex flex-col items-center py-12 text-center"><UsersRound className="h-9 w-9 text-muted-foreground/50" /><p className="mt-3 font-medium">No officers hired yet</p><p className="text-sm text-muted-foreground">Confirmed hires will appear here as a compact roster.</p></CardContent></Card>}
        {hires.length > 0 && filteredHires.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No hired officers match “{hireSearch}”.</div>}
      </div>

      <Dialog open={showManualUpdate} onOpenChange={setShowManualUpdate}>
        <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Add employment update</DialogTitle><DialogDescription>Record a note, status, incident, commendation, or performance review.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="space-y-2"><Label>Select employee</Label><Select value={selectedHire} onValueChange={setSelectedHire}><SelectTrigger><SelectValue placeholder="Choose an employee" /></SelectTrigger><SelectContent>{hires.map((hire) => <SelectItem key={hire.id} value={hire.id}>{hire.officer_profiles?.profiles?.full_name || "Unknown"} — {hire.position_title}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Update type</Label><Select value={updateType} onValueChange={setUpdateType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="performance_review">Performance review</SelectItem><SelectItem value="status_update">Status update</SelectItem><SelectItem value="incident_report">Incident report</SelectItem><SelectItem value="commendation">Commendation</SelectItem></SelectContent></Select></div>{updateType === "performance_review" && <div className="space-y-2"><Label>Performance rating</Label><div className="flex gap-2">{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" onClick={() => setRating(star)} className="focus:outline-none"><Star className={`h-6 w-6 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} /></button>)}</div></div>}<div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add details about this update…" rows={4} /></div><Button className="w-full" onClick={() => void handleSubmitUpdate()}>Save update</Button></div></DialogContent>
      </Dialog>
      <Dialog open={Boolean(complianceHire)} onOpenChange={(open) => !open && setComplianceHire(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader><DialogTitle>{complianceHire?.officer_profiles?.profiles?.full_name || "Officer"} onboarding documents</DialogTitle><DialogDescription>Review and download the forms this officer completed. Signed records are retained by version and protected by expiring links.</DialogDescription></DialogHeader>
          {complianceLoading ? <p className="flex items-center justify-center gap-2 py-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading onboarding documents...</p> : complianceDocuments.length ? (
            <div className="space-y-4 py-4"><div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-4"><div><strong className="block text-green-950">{complianceDocuments.length} completed document{complianceDocuments.length === 1 ? "" : "s"}</strong><span className="text-xs text-green-900/70">Ready for company records</span></div><Button type="button" onClick={() => void downloadAllDocuments()} disabled={downloadingDocuments}><Archive className="mr-2 h-4 w-4" />{downloadingDocuments ? "Preparing ZIP…" : "Download all"}</Button></div>{complianceDocuments.map((document) => (
              <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                <div className="min-w-0"><strong className="block">{document.label} {document.version && <Badge variant="secondary">Version {document.version}</Badge>}</strong><span className="block text-xs text-muted-foreground">Submitted {new Date(document.submittedAt).toLocaleString()}</span>{document.sha256 && <span className="block truncate font-mono text-[10px] text-muted-foreground" title={document.sha256}>SHA-256: {document.sha256}</span>}</div>
                <div className="flex gap-2"><Button type="button" size="sm" onClick={() => window.open(document.url, "_blank", "noopener,noreferrer")}><Eye className="mr-2 h-4 w-4" />View</Button><Button type="button" size="sm" variant="outline" onClick={() => void downloadDocument(document).catch(() => toast.error(`Could not download ${document.label}`))}><Download className="mr-2 h-4 w-4" />Download</Button></div>
              </div>
            ))}</div>
          ) : <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><strong className="block">No archived compliance documents yet</strong>Documents will appear here as the officer verifies and saves each onboarding form.</div>}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmploymentTracking;
