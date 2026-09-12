import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileCheck2, Loader2 } from "lucide-react";
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type DocumentRecord = {
  id: string;
  label: string;
  version: number | null;
  submittedAt: string;
  filename: string;
  pageStart: number;
  pageCount: number;
};

type Props = { open: boolean; onOpenChange: (open: boolean) => void; application: any };

export function OnboardingDocumentsDialog({ open, onOpenChange, application }: Props) {
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [packetUrl, setPacketUrl] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);

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
            .select("i9_document_path,i9_submitted_at,w4_document_path,w4_submitted_at")
            .eq("id", packetId)
            .maybeSingle(),
        ]);
        if (recordsResult.error) throw recordsResult.error;
        if (packetResult.error) throw packetResult.error;

        const entries = (recordsResult.data || []).map((document: any) => ({ ...document }));
        if (!entries.some((document: any) => document.document_type === "form-i9") && packetResult.data?.i9_document_path) {
          entries.unshift({ id: `legacy-i9-${packetId}`, document_label: "Signed Form I-9", version: null, submitted_at: packetResult.data.i9_submitted_at, storage_path: packetResult.data.i9_document_path, document_type: "form-i9" });
        }
        if (!entries.some((document: any) => document.document_type === "form-w4") && packetResult.data?.w4_document_path) {
          entries.push({ id: `legacy-w4-${packetId}`, document_label: "Signed Form W-4", version: null, submitted_at: packetResult.data.w4_submitted_at, storage_path: packetResult.data.w4_document_path, document_type: "form-w4" });
        }

        const signedResult = entries.length
          ? await supabase.storage.from("onboarding-documents").createSignedUrls(entries.map((document: any) => document.storage_path), 3600)
          : { data: [], error: null };
        if (signedResult.error) throw signedResult.error;
        const urls = new Map((signedResult.data || []).map((item: any) => [item.path, item.signedUrl]));

        const merged = await PDFDocument.create();
        const prepared: DocumentRecord[] = [];
        let nextPage = 1;
        for (const entry of entries) {
          const url = urls.get(entry.storage_path) as string | undefined;
          if (!url) continue;
          const response = await fetch(url);
          if (!response.ok) continue;
          const source = await PDFDocument.load(await response.arrayBuffer());
          const sourcePages = await merged.copyPages(source, source.getPageIndices());
          sourcePages.forEach(page => merged.addPage(page));
          prepared.push({
            id: entry.id,
            label: entry.document_label,
            version: entry.version,
            submittedAt: entry.submitted_at,
            filename: `${entry.document_type}${entry.version ? `-v${entry.version}` : ""}.pdf`,
            pageStart: nextPage,
            pageCount: sourcePages.length,
          });
          nextPage += sourcePages.length;
          void (supabase as any).rpc("log_sensitive_access", {
            _action: "view",
            _table_name: "officer_compliance_documents",
            _record_id: entry.id,
            _details: { document_type: entry.document_type, officer_id: application.officer?.id },
          });
        }

        if (!prepared.length) throw new Error("No completed onboarding documents are available yet");
        const bytes = await merged.save();
        createdPacketUrl = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }));
        if (active) {
          setDocuments(prepared);
          setPageCount(nextPage - 1);
          setPacketUrl(createdPacketUrl);
        }
      } catch (error: any) {
        toast.error(error.message || "The onboarding packet could not be prepared");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
      if (createdPacketUrl) URL.revokeObjectURL(createdPacketUrl);
    };
  }, [open, application]);

  const selectedDocument = documents.find(document => currentPage >= document.pageStart && currentPage < document.pageStart + document.pageCount);
  const packetFilename = `${(application?.officerName || "officer").replace(/[^a-z0-9]+/gi, "-")}-onboarding-packet.pdf`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[94vh] max-w-[96vw] flex-col overflow-hidden p-0 xl:max-w-7xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-primary" />{application?.officerName || "Officer"} onboarding packet</DialogTitle>
              <DialogDescription>Preview every completed page here, then print or download the complete packet.</DialogDescription>
            </div>
            {packetUrl && <Button asChild size="sm" variant="outline"><a href={packetUrl} download={packetFilename}><Download className="mr-2 h-4 w-4" />Download packet PDF</a></Button>}
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
                  <Button type="button" size="icon" variant="secondary" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage(page => Math.max(1, page - 1))}><ChevronLeft className="h-4 w-4" /><span className="sr-only">Previous page</span></Button>
                  <span className="min-w-24 text-center text-sm">Page {currentPage} of {pageCount}</span>
                  <Button type="button" size="icon" variant="secondary" className="h-8 w-8" disabled={currentPage >= pageCount} onClick={() => setCurrentPage(page => Math.min(pageCount, page + 1))}><ChevronRight className="h-4 w-4" /><span className="sr-only">Next page</span></Button>
                </div>
              </div>
              <iframe key={currentPage} src={`${packetUrl}#page=${currentPage}&toolbar=1&navpanes=0&view=FitH`} title={`${application?.officerName || "Officer"} onboarding print preview`} className="min-h-0 flex-1 bg-zinc-700" />
            </section>
          </div>
        ) : (
          <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><strong className="block">No completed documents are available yet</strong>Documents will appear here as the officer completes the onboarding packet.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
