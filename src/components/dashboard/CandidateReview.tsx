import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
export const candidateRatings = {
  unrated: "Not rated",
  great: "Great candidate",
  good: "Good candidate",
  not_suitable: "Not suitable",
};
export const candidateReasons = {
  none: "No follow-up reason",
  schedule: "Schedule mismatch",
  area: "Area / location mismatch",
  future_opening: "Keep for future opening",
  license: "License / training needed",
  other: "Other",
};
export function CandidateReview({
  application,
  onSaved,
}: {
  application: any;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rating, setRating] = useState("unrated");
  const [reason, setReason] = useState("none");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    if (open) {
      const r = application.candidateReview;
      setRating(r?.rating || "unrated");
      setReason(r?.reason || "none");
      setNotes(r?.notes || "");
      setDate(r?.follow_up_date || "");
    }
  }, [open, application.id]);
  const save = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("save_candidate_review", {
        _application_id: application.id,
        _rating: rating,
        _reason: reason,
        _notes: notes,
        _follow_up_date: date || null,
      });
      if (error) throw error;
      toast.success("Candidate rating and follow-up saved");
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Could not save candidate rating");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Rate / follow up
      </Button>
      <Dialog open={open} onOpenChange={(v) => !saving && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Candidate rating — {application.officerName}</DialogTitle>
            <DialogDescription>
              Private to your company. This keeps the hiring stage unchanged and does not notify the
              applicant.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="candidate-rating">Rating</Label>
          <select
            id="candidate-rating"
            className="h-10 rounded-md border bg-background px-3"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
          >
            {Object.entries(candidateRatings).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <Label htmlFor="candidate-reason">Follow-up reason</Label>
          <select
            id="candidate-reason"
            className="h-10 rounded-md border bg-background px-3"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {Object.entries(candidateReasons).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <Label htmlFor="candidate-date">Follow-up date (optional)</Label>
          <Input
            id="candidate-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Label htmlFor="candidate-note">Notes{reason === "other" ? " (required)" : ""}</Label>
          <Textarea
            id="candidate-note"
            maxLength={5000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="For example: Available 5:30 AM–2 PM; prefers southwest Houston."
          />
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={saving || (reason === "other" && !notes.trim())}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save rating"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
