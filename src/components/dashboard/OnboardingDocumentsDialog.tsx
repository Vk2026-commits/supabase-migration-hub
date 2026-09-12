import { useEffect, useState } from "react";
import { Archive, Download, Eye, FileCheck2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createZip } from "@/lib/createZip";
import { toast } from "sonner";

type DocumentRecord = { id: string; label: string; version: number | null; submittedAt: string; sha256: string | null; url: string; filename: string };
type Props = { open: boolean; onOpenChange: (open: boolean) => void; application: any };

export function OnboardingDocumentsDialog({ open, onOpenChange, application }: Props) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);

  useEffect(() => {
    if (!open || !application) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setDocuments([]);
      try {
        const packetId = application.onboardingProgress?.packet_id;
        if (!packetId) throw new Error("This officer has not started an onboarding packet yet");
        const [recordsResult, packetResult] = await Promise.all([
          (supabase as any).from("officer_compliance_documents").select("id,document_label,version,submitted_at,sha256,storage_path,document_type").eq("packet_id", packetId).order("submitted_at", { ascending: false }),
          (supabase as any).from("officer_onboarding_packets").select("i9_document_path,i9_submitted_at,w4_document_path,w4_submitted_at").eq("id", packetId).maybeSingle(),
        ]);
        if (recordsResult.error) throw recordsResult.error;
        if (packetResult.error) throw packetResult.error;
        const entries = (recordsResult.data || []).map((document: any) => ({ ...document, legacy: false }));
        if (!entries.some((document: any) => document.document_type === "form-i9") && packetResult.data?.i9_document_path) entries.push({ id: `legacy-i9-${packetId}`, document_label: "Signed Form I-9", version: null, submitted_at: packetResult.data.i9_submitted_at, sha256: null, storage_path: packetResult.data.i9_document_path, document_type: "form-i9", legacy: true });
        if (!entries.some((document: any) => document.document_type === "form-w4") && packetResult.data?.w4_document_path) entries.push({ id: `legacy-w4-${packetId}`, document_label: "Signed Form W-4", version: null, submitted_at: packetResult.data.w4_submitted_at, sha256: null, storage_path: packetResult.data.w4_document_path, document_type: "form-w4", legacy: true });
        const signedResult = entries.length ? await supabase.storage.from("onboarding-documents").createSignedUrls(entries.map((document: any) => document.storage_path), 3600) : { data: [], error: null };
        if (signedResult.error) throw signedResult.error;
        const urls = new Map((signedResult.data || []).map((item: any) => [item.path, item.signedUrl]));
        const nextDocuments = entries.map((document: any) => ({ id: document.id, label: document.document_label, version: document.version, submittedAt: document.submitted_at, sha256: document.sha256, url: urls.get(document.storage_path), filename: `${document.document_type}${document.version ? `-v${document.version}` : ""}.pdf` })).filter((document: any) => document.url) as DocumentRecord[];
        for (const document of entries) void (supabase as any).rpc("log_sensitive_access", { _action: "view", _table_name: "officer_compliance_documents", _record_id: document.id, _details: { document_type: document.document_type, officer_id: application.officer?.id } });
        if (active) setDocuments(nextDocuments);
      } catch (error: any) {
        toast.error(error.message || "The onboarding documents could not be loaded");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [open, application]);

  const downloadFile = async (file: DocumentRecord) => {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`Could not download ${file.label}`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = async () => {
    setDownloading(true);
    try {
      const files = await Promise.all(documents.map(async document => {
        const response = await fetch(document.url);
        if (!response.ok) throw new Error(`Could not download ${document.label}`);
        return { name: document.filename, data: await response.blob() };
      }));
      const archive = await createZip(files);
      const url = URL.createObjectURL(archive);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${(application?.officerName || "officer").replace(/[^a-z0-9]+/gi, "-")}-onboarding-documents.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Onboarding documents downloaded");
    } catch (error: any) {
      toast.error(error.message || "The onboarding documents could not be downloaded");
    } finally {
      setDownloading(false);
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-primary" />{application?.officerName || "Officer"} onboarding documents</DialogTitle><DialogDescription>View individual completed forms or download the officer’s full onboarding packet for company records.</DialogDescription></DialogHeader>{loading ? <p className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading onboarding documents…</p> : documents.length ? <div className="space-y-4 py-3"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4"><div><strong className="block text-green-950">{documents.length} completed document{documents.length === 1 ? "" : "s"}</strong><span className="text-xs text-green-900/70">Ready to review or save</span></div><Button type="button" onClick={() => void downloadAll()} disabled={downloading}><Archive className="mr-2 h-4 w-4" />{downloading ? "Preparing ZIP…" : "Download all"}</Button></div>{documents.map(document => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div className="min-w-0"><strong>{document.label}</strong>{document.version && <Badge variant="secondary" className="ml-2">Version {document.version}</Badge>}<span className="block text-xs text-muted-foreground">Submitted {new Date(document.submittedAt).toLocaleString()}</span></div><div className="flex gap-2"><Button type="button" size="sm" onClick={() => window.open(document.url, "_blank", "noopener,noreferrer")}><Eye className="mr-2 h-4 w-4" />View</Button><Button type="button" size="sm" variant="outline" onClick={() => void downloadFile(document).catch(() => toast.error(`Could not download ${document.label}`))}><Download className="mr-2 h-4 w-4" />Download</Button></div></div>)}</div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><strong className="block">No completed documents are available yet</strong>The files will appear here as the officer finishes each onboarding form.</div>}</DialogContent></Dialog>;
}
