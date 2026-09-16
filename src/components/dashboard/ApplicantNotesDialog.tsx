import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";

interface ApplicantNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  application: any;
  onSaved: () => void;
}

export function ApplicantNotesDialog({ open, onOpenChange, companyId, application, onSaved }: ApplicantNotesDialogProps) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setNote(application?.companyNote?.note || "");
  }, [open, application]);

  const saveNote = async () => {
    if (!application?.id) return;
    setSaving(true);
    try {
      const trimmedNote = note.trim();
      if (!trimmedNote && application.companyNote?.id) {
        const { error } = await (supabase as any)
          .from("company_applicant_notes")
          .delete()
          .eq("id", application.companyNote.id);
        if (error) throw error;
      } else if (trimmedNote) {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw userError || new Error("Please sign in again to save this note.");
        const { error } = await (supabase as any)
          .from("company_applicant_notes")
          .upsert({
            company_id: companyId,
            job_application_id: application.id,
            note: trimmedNote,
            updated_by: userData.user.id,
          }, { onConflict: "company_id,job_application_id" });
        if (error) throw error;
      }
      toast.success(trimmedNote ? "Applicant note saved" : "Applicant note removed");
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      console.error("Failed to save applicant note", error);
      toast.error(error?.message || "The note could not be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><StickyNote className="h-5 w-5 text-primary" />Notes for {application?.officerName}</DialogTitle>
          <DialogDescription>Private notes for your company team. The applicant cannot see them.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add interview reminders, follow-up details, or other internal notes…"
          className="min-h-40 resize-y"
          maxLength={10000}
          autoFocus
        />
        <div className="text-right text-xs text-muted-foreground">{note.length.toLocaleString()} / 10,000</div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={saving} onClick={() => void saveNote()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
