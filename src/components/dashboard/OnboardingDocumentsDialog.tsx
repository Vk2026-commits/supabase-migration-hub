import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileCheck2, Loader2, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { generateGuardApplicationPDF, type GuardApplicationData } from "@/lib/generateGuardApplicationPDF";

type DocumentRecord = {
  id: string;
  label: string;
  version: number | null;
  submittedAt: string;
  filename: string;
  pageStart: number;
  pageCount: number;
  documentType: string;
  sourceUrl?: string;
  complianceDocumentId?: string;
};

type Props = { open: boolean; onOpenChange: (open: boolean) => void; application: any; onAccepted?: () => void };

export function OnboardingDocumentsDialog({ open, onOpenChange, application, onAccepted }: Props) {
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [packetUrl, setPacketUrl] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionArea, setCorrectionArea] = useState("");
  const [correctionInstructions, setCorrectionInstructions] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [uploadingOfficeCopy, setUploadingOfficeCopy] = useState(false);

  useEffect(() => {
    if (!open || !application) return;
    let active = true;
    let createdPacketUrl = "";

    const load = async () => {
      setLoading(true);
      setDocuments([]);
      setPacketUrl("");
      setCurrentPage(1);
      setPageCount(0);
      setLoadError("");
      try {
        const packetId = application.onboardingProgress?.packet_id;
        if (!packetId) throw new Error("This officer has not started an onboarding packet yet");

        const [recordsResult, packetResult] = await Promise.all([
          (supabase as any)
            .from("officer_compliance_documents")
            .select("id,document_label,version,submitted_at,storage_path,document_type")
            .eq("packet_id", packetId)
            .order("submitted_at", { ascending: true }),
          (supabase as any)
            .from("officer_onboarding_packets")
            .select("id,hire_id,hiring_application_id,i9_document_path,i9_submitted_at,w4_document_path,w4_submitted_at")
            .eq("id", packetId)
            .maybeSingle(),
        ]);
        if (recordsResult.error) throw recordsResult.error;
        if (packetResult.error) throw packetResult.error;

        const entries: any[] = [];
        const hiringApplicationId = packetResult.data?.hiring_application_id || application.hiringApplicationId;
        if (hiringApplicationId) {
          const { data: hiringApplication } = await (supabase as any)
            .from("guard_hiring_applications")
            .select("application_data,applicant_name,applicant_email,company_name,position")
            .eq("id", hiringApplicationId)
            .maybeSingle();
          if (hiringApplication?.application_data) {
            try {
              const snapshot = hiringApplication.application_data as GuardApplicationData;
              const applicationBlob = await generateGuardApplicationPDF({ ...snapshot, licenseLevels: snapshot.licenseLevels || [], workHistory: snapshot.workHistory || [], references: snapshot.references || [] }, "blob");
              if (applicationBlob instanceof Blob) entries.push({ id: `application-${hiringApplicationId}`, document_label: "Security Officer Application", version: null, submitted_at: "", document_type: "hiring-application", blob: applicationBlob });
            } catch (error) {
              console.warn("The submitted application could not be added to this packet", error);
            }
          }
        }

        const hireId = packetResult.data?.hire_id || application.hireId;
        let offerId = application.offerId;
        if (!offerId && hireId) {
          const { data: hire } = await (supabase as any).from("hires").select("offer_id").eq("id", hireId).maybeSingle();
          offerId = hire?.offer_id;
        }
        if (offerId) {
          try {
            const { data: offerPreview, error: offerError } = await supabase.functions.invoke("manage-employment-offer", { body: { action: "preview", offer_id: offerId } });
            if (offerError || !offerPreview?.url) throw offerError || new Error("Offer preview unavailable");
            const response = await fetch(offerPreview.url);
            if (!response.ok) throw new Error("Offer download failed");
            entries.push({ id: `offer-${offerId}`, document_label: "Accepted Officer Letter", version: null, submitted_at: "", document_type: "accepted-offer", blob: await response.blob(), source_url: offerPreview.url });
          } catch (error) {
            console.warn("The accepted offer could not be added to this packet", error);
          }
        }

        entries.push(...(recordsResult.data || []).map((document: any) => ({ ...document })));
        if (!entries.some((document: any) => document.document_type === "form-i9") && packetResult.data?.i9_document_path) {
          const packetIntroductionCount = entries.filter((document: any) => document.blob).length;
          entries.splice(packetIntroductionCount, 0, { id: `legacy-i9-${packetId}`, document_label: "Signed Form I-9", version: null, submitted_at: packetResult.data.i9_submitted_at, storage_path: packetResult.data.i9_document_path, document_type: "form-i9" });
        }
        if (!entries.some((document: any) => document.document_type === "form-w4") && packetResult.data?.w4_document_path) {
          entries.push({ id: `legacy-w4-${packetId}`, document_label: "Signed Form W-4", version: null, submitted_at: packetResult.data.w4_submitted_at, storage_path: packetResult.data.w4_document_path, document_type: "form-w4" });
        }

        const storedEntries = entries.filter((document: any) => document.storage_path);
        const signedResult = storedEntries.length
          ? await supabase.storage.from("onboarding-documents").createSignedUrls(storedEntries.map((document: any) => document.storage_path), 3600)
          : { data: [], error: null };
        if (signedResult.error) throw signedResult.error;
        const urls = new Map((signedResult.data || []).map((item: any) => [item.path, item.signedUrl]));

        const merged = await PDFDocument.create();
        const prepared: DocumentRecord[] = [];
        const failedLabels: string[] = [];
        let nextPage = 1;
        for (const entry of entries) {
          try {
            const url = entry.source_url || (urls.get(entry.storage_path) as string | undefined);
            if (!entry.blob && !url) throw new Error("A secure document link was not returned");
            const response = entry.blob ? null : await fetch(url!);
            if (response && !response.ok) throw new Error(`Document download failed (${response.status})`);
            const sourceBlob: Blob = entry.blob || await response!.blob();
            const bytes = await sourceBlob.arrayBuffer();
            const contentType = (sourceBlob.type || response?.headers.get("content-type") || "").toLowerCase();
            const path = String(entry.storage_path || "").toLowerCase();
            const isJpeg = contentType.includes("image/jpeg") || /\.(jpe?g)$/.test(path);
            const isPng = contentType.includes("image/png") || /\.png$/.test(path);
            let documentPageCount = 0;

            if (isJpeg || isPng) {
              const image = isPng ? await merged.embedPng(bytes) : await merged.embedJpg(bytes);
              const page = merged.addPage([612, 792]);
              const margin = 36;
              const scale = Math.min(
                (page.getWidth() - margin * 2) / image.width,
                (page.getHeight() - margin * 2) / image.height,
              );
              const width = image.width * scale;
              const height = image.height * scale;
              page.drawImage(image, {
                x: (page.getWidth() - width) / 2,
                y: (page.getHeight() - height) / 2,
                width,
                height,
              });
              documentPageCount = 1;
            } else {
              const source = await PDFDocument.load(bytes);
              const sourcePages = await merged.copyPages(source, source.getPageIndices());
              sourcePages.forEach(page => merged.addPage(page));
              documentPageCount = sourcePages.length;
            }

            if (!documentPageCount) throw new Error("The document did not contain a viewable page");
            prepared.push({
              id: entry.id,
              label: entry.document_label,
              version: entry.version,
              submittedAt: entry.submitted_at,
              filename: `${entry.document_type}${entry.version ? `-v${entry.version}` : ""}.pdf`,
              pageStart: nextPage,
              pageCount: documentPageCount,
              documentType: entry.document_type,
              sourceUrl: url,
              complianceDocumentId: String(entry.id).startsWith("legacy-") || entry.blob ? undefined : entry.id,
            });
            nextPage += documentPageCount;
            if (!entry.blob && !String(entry.id).startsWith("legacy-")) void (supabase as any).rpc("log_sensitive_access", {
              _action: "view",
              _table_name: "officer_compliance_documents",
              _record_id: entry.id,
              _details: { document_type: entry.document_type, officer_id: application.officer?.id },
            });
          } catch (error) {
            console.error(`Could not prepare ${entry.document_label}`, error);
            failedLabels.push(entry.document_label);
          }
        }

        if (!prepared.length) throw new Error("No completed onboarding documents are available yet");
        if (failedLabels.length) toast.warning(`${failedLabels.length} document${failedLabels.length === 1 ? "" : "s"} could not be added to the preview`);
        const bytes = await merged.save();
        createdPacketUrl = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }));
        if (active) {
          setDocuments(prepared);
          setPageCount(nextPage - 1);
          setPacketUrl(createdPacketUrl);
        }
      } catch (error: any) {
        const message = error.message || "The onboarding packet could not be prepared";
        setLoadError(message);
        toast.error(message);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
      if (createdPacketUrl) URL.revokeObjectURL(createdPacketUrl);
    };
  }, [open, application, reloadKey]);

  const selectedDocument = documents.find(document => currentPage >= document.pageStart && currentPage < document.pageStart + document.pageCount);
  const packetFilename = `${(application?.officerName || "officer").replace(/[^a-z0-9]+/gi, "-")}-onboarding-packet.pdf`;
  const packetId = application?.onboardingProgress?.packet_id;
  const hireId = application?.hireId || application?.onboardingProgress?.hire_id;
  const officeEditable = selectedDocument && ["form-i9", "form-w4", "policy-uniform"].includes(selectedDocument.documentType);
  const correctionAvailable = selectedDocument && !["hiring-application", "accepted-offer"].includes(selectedDocument.documentType);

  const sendCorrection = async () => {
    if (!selectedDocument || !hireId || !correctionArea.trim() || !correctionInstructions.trim()) {
      toast.error("Choose the area and explain what the officer needs to correct");
      return;
    }
    setSavingCorrection(true);
    try {
      const { error } = await (supabase as any).rpc("request_onboarding_correction", {
        _hire_id: hireId,
        _document_id: selectedDocument.complianceDocumentId || null,
        _document_type: selectedDocument.documentType,
        _document_label: selectedDocument.label,
        _page_number: currentPage - selectedDocument.pageStart + 1,
        _area_label: correctionArea.trim(),
        _instructions: correctionInstructions.trim(),
      });
      if (error) throw error;
      toast.success(`Correction request sent for ${selectedDocument.label}`);
      setCorrectionOpen(false);
      setCorrectionArea("");
      setCorrectionInstructions("");
      onAccepted?.();
    } catch (error: any) {
      toast.error(error.message || "The correction request could not be sent");
    } finally {
      setSavingCorrection(false);
    }
  };

  const acceptOnboarding = async () => {
    if (!hireId) return;
    setAccepting(true);
    try {
      const { error } = await (supabase as any).rpc("complete_officer_onboarding", { _hire_id: hireId });
      if (error) throw error;
      toast.success("Onboarding reviewed and accepted");
      onAccepted?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "The onboarding packet could not be accepted");
    } finally {
      setAccepting(false);
    }
  };

  const uploadOfficeCopy = async (file: File) => {
    if (!selectedDocument || !packetId || !application?.officer?.id || file.type !== "application/pdf") {
      toast.error("Choose a completed PDF file");
      return;
    }
    setUploadingOfficeCopy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in again before uploading");
      const { data: versions, error: versionsError } = await (supabase as any)
        .from("officer_compliance_documents")
        .select("version")
        .eq("packet_id", packetId)
        .eq("document_type", selectedDocument.documentType)
        .order("version", { ascending: false })
        .limit(1);
      if (versionsError) throw versionsError;
      const version = Number(versions?.[0]?.version || 0) + 1;
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const sha256 = Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, "0")).join("");
      const storagePath = `${auth.user.id}/${packetId}/office/${selectedDocument.documentType}/v${version}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("onboarding-documents").upload(storagePath, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
      const { error: insertError } = await (supabase as any).from("officer_compliance_documents").insert({
        packet_id: packetId,
        officer_id: application.officer.id,
        hiring_application_id: application.hiringApplicationId || null,
        document_type: selectedDocument.documentType,
        document_label: `${selectedDocument.label} — office completed`,
        version,
        storage_path: storagePath,
        sha256,
        signed_at: new Date().toISOString(),
        metadata: { officeCompleted: true, sourceDocumentId: selectedDocument.complianceDocumentId || null },
      });
      if (insertError) throw insertError;
      toast.success("Office-completed version added without changing the officer's original");
      setReloadKey(key => key + 1);
    } catch (error: any) {
      toast.error(error.message || "The office copy could not be uploaded");
    } finally {
      setUploadingOfficeCopy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94vh] max-w-[96vw] flex-col overflow-hidden p-0 xl:max-w-7xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-primary" />{application?.officerName || "Officer"} onboarding packet</DialogTitle>
              <DialogDescription>Review every completed document together in one print-style packet.</DialogDescription>
            </div>
            {packetUrl && <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => void acceptOnboarding()} disabled={accepting || !hireId}><ShieldCheck className="mr-2 h-4 w-4" />{accepting ? "Accepting…" : "Reviewed — accept onboarding"}</Button><Button asChild size="sm"><a href={packetUrl} download={packetFilename}><Download className="mr-2 h-4 w-4" />Download all as one PDF</a></Button></div>}
          </div>
        </DialogHeader>

        {loading ? (
          <p className="flex flex-1 items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Preparing print preview…</p>
        ) : packetUrl ? (
          <div className="grid min-h-0 flex-1 md:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-r bg-muted/30 p-3">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Completed forms</p>
              <div className="space-y-1">
                {documents.map(document => (
                  <button type="button" key={document.id} onClick={() => setCurrentPage(document.pageStart)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedDocument?.id === document.id ? "border-primary bg-primary/10" : "border-transparent hover:bg-background"}`}>
                    <span className="block text-sm font-semibold">{document.label}{document.version && <Badge variant="secondary" className="ml-2">v{document.version}</Badge>}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{document.pageCount} page{document.pageCount === 1 ? "" : "s"} · starts on page {document.pageStart}</span>
                  </button>
                ))}
              </div>
            </aside>
            <section className="flex min-h-0 flex-col bg-zinc-800">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-700 bg-zinc-900 px-4 py-2 text-white">
                <span className="truncate text-sm">{selectedDocument?.label || "Complete onboarding packet"}</span>
                <div className="flex items-center gap-2">
                  {correctionAvailable && <Button type="button" size="sm" variant="secondary" className="h-8" onClick={() => setCorrectionOpen(open => !open)}><RotateCcw className="mr-1.5 h-4 w-4" />Request correction</Button>}
                  {officeEditable && selectedDocument?.sourceUrl && <Button asChild type="button" size="sm" variant="secondary" className="h-8"><a href={selectedDocument.sourceUrl} target="_blank" rel="noreferrer">Open fillable office copy</a></Button>}
                  {officeEditable && <label className="inline-flex h-8 cursor-pointer items-center rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"><Upload className="mr-1.5 h-4 w-4" />{uploadingOfficeCopy ? "Uploading…" : "Upload office copy"}<Input type="file" accept="application/pdf" className="sr-only" disabled={uploadingOfficeCopy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadOfficeCopy(file); event.currentTarget.value = ""; }} /></label>}
                  <Button type="button" size="icon" variant="secondary" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Previous page</span></Button>
                  <span className="min-w-24 text-center text-sm">Page {currentPage} of {pageCount}</span>
                  <Button type="button" size="icon" variant="secondary" className="h-8 w-8" disabled={currentPage >= pageCount} onClick={() => setCurrentPage(page => Math.min(pageCount, page + 1))}><ChevronRight className="h-4 w-4" /><span className="sr-only">Next page</span></Button>
                </div>
              </div>
              {correctionOpen && selectedDocument && <div className="border-b border-amber-300 bg-amber-50 p-4 text-amber-950"><div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]"><div><Label htmlFor="correction-area">Area to correct</Label><Input id="correction-area" className="mt-1 bg-white" value={correctionArea} onChange={(event) => setCorrectionArea(event.target.value)} placeholder="Example: Printed name" /></div><div><Label htmlFor="correction-instructions">Instructions for officer</Label><Textarea id="correction-instructions" className="mt-1 min-h-10 bg-white" value={correctionInstructions} onChange={(event) => setCorrectionInstructions(event.target.value)} placeholder="Explain exactly what needs to be corrected" /></div><div className="flex items-end gap-2"><Button type="button" variant="outline" onClick={() => setCorrectionOpen(false)}>Cancel</Button><Button type="button" onClick={() => void sendCorrection()} disabled={savingCorrection}>{savingCorrection ? "Sending…" : `Send page ${currentPage - selectedDocument.pageStart + 1} back`}</Button></div></div></div>}
              <iframe key={currentPage} src={`${packetUrl}#page=${currentPage}&toolbar=1&navpanes=0&view=FitH`} title={`${application?.officerName || "Officer"} onboarding print preview`} className="min-h-0 flex-1 bg-zinc-700" />
            </section>
          </div>
        ) : loadError ? (
          <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-950"><strong className="block">The submitted packet could not be displayed</strong>{loadError}</div>
        ) : (
          <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><strong className="block">No completed documents are available yet</strong>Documents will appear here as the officer completes the onboarding packet.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
