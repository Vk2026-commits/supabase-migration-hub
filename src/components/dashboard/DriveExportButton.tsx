import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CloudUpload } from "lucide-react";
export function DriveExportButton({
  applicationId,
  hireId,
  kind,
  getPdf,
  disabled = false,
}: {
  applicationId?: string;
  hireId?: string;
  kind: "application" | "onboarding";
  getPdf: () => Promise<Blob>;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const invoke = async (body: any) => {
    const { data, error } = await supabase.functions.invoke("company-drive", { body });
    if (error) {
      let message = "Google Drive could not be reached. Please retry.";
      try {
        message = (await error.context.json()).error || message;
      } catch {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const inspect = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    setOpen(true);
    try {
      setStatus(await invoke({ action: "status", application_id: applicationId, hire_id: hireId }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const connect = async () => {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setBusy(true);
    setError("");
    try {
      const data = await invoke({
        action: "connect",
        application_id: applicationId,
        hire_id: hireId,
      });
      if (popup) popup.location.href = data.url;
      else window.location.assign(data.url);
    } catch (e: any) {
      popup?.close();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const pdf = await getPdf();
      const body = new FormData();
      body.set("action", "export");
      if (applicationId) body.set("application_id", applicationId);
      if (hireId) body.set("hire_id", hireId);
      body.set("document_kind", kind);
      body.set("file", pdf, `${kind}.pdf`);
      setResult(await invoke(body));
      toast.success("PDF saved to the company Google Drive");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || busy || (!applicationId && !hireId)}
        onClick={() => void inspect()}
      >
        <CloudUpload className="mr-2 h-4 w-4" />
        Save to Google Drive
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Save {kind === "application" ? "application" : "onboarding packet"} to Google Drive
            </DialogTitle>
            <DialogDescription>
              The PDF goes into this applicant’s folder inside your company’s shared export
              location. Google Drive folder access determines who can view it.
            </DialogDescription>
          </DialogHeader>
          {busy && <p role="status">Working…</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {result ? (
            <div className="space-y-2">
              <p className="font-medium text-green-700">PDF saved successfully.</p>
              <a
                className="block text-primary underline"
                href={result.file_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open exported PDF
              </a>
              <a
                className="block text-primary underline"
                href={result.folder_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open applicant folder
              </a>
            </div>
          ) : status && !busy ? (
            <>
              {!status.configured ? (
                <p>
                  Google Drive setup is not complete. An administrator needs to configure the Google
                  connection before exporting.
                </p>
              ) : status.connected ? (
                <p>Ready to save into the connected company folder.</p>
              ) : (
                <p>
                  {status.can_connect
                    ? "Connect the company’s Google account once. Authorized hiring staff can then export into the same folder."
                    : "Ask a company administrator to connect Google Drive first."}
                </p>
              )}
              {status.folder_url && (
                <a
                  href={status.folder_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  View company export folder
                </a>
              )}
            </>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Close
            </Button>
            {!result &&
              status?.configured &&
              (!status.connected ? (
                <>
                  <Button variant="outline" disabled={busy} onClick={() => void inspect()}>
                    Check connection
                  </Button>
                  {status.can_connect && (
                    <Button disabled={busy} onClick={() => void connect()}>
                      Connect company Google Drive
                    </Button>
                  )}
                </>
              ) : (
                <Button disabled={busy} onClick={() => void save()}>
                  Save PDF
                </Button>
              ))}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
