import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export function ApplicantReviewAction({ applicationId, officerName, decline = false, onChanged }: {
  applicationId: string;
  officerName: string;
  decline?: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const label = decline ? "Not moving forward" : "Mark reviewed";
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc(
        decline ? "close_job_application_not_selected" : "mark_job_application_reviewed",
        { _job_application_id: applicationId, ...(decline ? { _reason: reason.trim() || null } : {}) },
      );
      if (error) throw error;
      toast.success(decline ? "Application closed as not selected." : "Application reviewed. You can now schedule an interview or choose not to move forward.");
      setOpen(false);
      onChanged();
    } catch (error: any) {
      toast.error(error.message || "Could not update application");
    } finally {
      setSaving(false);
    }
  };
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`${label} for ${officerName}`}>{label}</Button>
    <AlertDialog open={open} onOpenChange={(value) => { if (!saving) setOpen(value); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{decline ? "Close this application?" : "Mark application reviewed?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {decline ? `Record that you are not moving forward with ${officerName}.` : `Confirm you have reviewed ${officerName}’s submitted application and supporting information. This unlocks interview scheduling; it does not schedule an interview or hire the applicant.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {decline && <Textarea aria-label="Reason for not moving forward (optional)" placeholder="Reason (optional)" value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void save(); }}>{saving ? "Saving…" : label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
