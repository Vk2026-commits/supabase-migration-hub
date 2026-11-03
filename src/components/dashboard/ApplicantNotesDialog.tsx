import { INTERVIEW_QUESTIONS, isKairos, readInterviewNotes, writeInterviewNotes } from "@/lib/kairosWorkflow";
import { Label } from "@/components/ui/label";
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
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { const saved = readInterviewNotes(application?.companyNote?.note || ""); setNote(saved.general); setAnswers(saved.answers); }
  }, [open, application?.id]);

  const saveNote = async () => {
    if (!application?.id) return;
    setSaving(true);
    try {
      const trimmedNote = writeInterviewNotes(note, answers);
      if (trimmedNote.length > 10000) throw new Error("Please shorten your notes to fit the 10,000-character limit.");
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><StickyNote className="h-5 w-5 text-primary" />Notes for {application?.officerName}</DialogTitle>
          <DialogDescription>Private notes for your company team. The applicant cannot see them.</DialogDescription>
        </DialogHeader>
        <Label htmlFor="applicant-general-note">General notes</Label>
        <Textarea id="applicant-general-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Add interview reminders, follow-up details, or other internal notes…"
          className="min-h-40 resize-y"
          maxLength={10000}
          autoFocus
        />
        <div className="text-right text-xs text-muted-foreground">{writeInterviewNotes(note, answers).length.toLocaleString()} / 10,000</div>
        {isKairos(companyId) && application?.interview && <section className="space-y-5"><h3 className="font-semibold">Interview questions</h3>{INTERVIEW_QUESTIONS.map((question) => <div key={question.id} className="space-y-2"><Label htmlFor={`interview-answer-${question.id}`}>{question.text}</Label><Textarea id={`interview-answer-${question.id}`} value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Notes on this question…" maxLength={1000} disabled={saving} /></div>)}</section>}
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
