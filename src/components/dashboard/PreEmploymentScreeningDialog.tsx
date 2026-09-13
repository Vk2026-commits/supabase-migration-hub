import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const checkLabels: Record<string, string> = {
  background: "Background check",
  drug: "Drug screening",
  license: "Security license verification",
  work_authorization: "Work authorization",
};

const statusLabels: Record<string, string> = {
  not_started: "Not started",
  pending: "In progress",
  cleared: "Cleared",
  review_required: "Needs review",
  not_required: "Not required",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: any;
  onChanged: () => void;
};

export function PreEmploymentScreeningDialog({ open, onOpenChange, application, onChanged }: Props) {
  const [checks, setChecks] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setChecks((application?.screeningChecks || []).map((check: any) => ({ ...check })));
  }, [application]);

  const updateLocal = (id: string, values: Record<string, unknown>) => {
    setChecks(current => current.map(check => check.id === id ? { ...check, ...values } : check));
  };

  const save = async () => {
    if (!application?.hireId) return;
    setSaving(true);
    try {
      for (const check of checks) {
        const { error } = await (supabase as any).rpc("update_hire_screening_check", {
          _hire_id: application.hireId,
          _check_type: check.check_type,
          _status: check.status,
          _notes: check.notes || null,
        });
        if (error) throw error;
      }
      toast.success("Pre-employment screening was updated");
      onOpenChange(false);
      await onChanged();
    } catch (error: any) {
      toast.error(error?.message || "Screening could not be updated");
    } finally {
      setSaving(false);
    }
  };

  const requiredCleared = checks.filter(check => check.required).every(check => check.status === "cleared");

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Pre-employment screening for {application?.officerName}</DialogTitle>
        <DialogDescription>Record each required result. The officer cannot be moved to Hired until every required check is cleared.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {checks.map(check => <div key={check.id} className="rounded-xl border bg-muted/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4 text-primary" />{checkLabels[check.check_type] || check.check_type}</div>
            <Badge variant={check.required ? "default" : "secondary"}>{check.required ? "Required" : "Optional"}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor={`screening-status-${check.id}`}>Result</Label>
              <select id={`screening-status-${check.id}`} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={check.status} onChange={event => updateLocal(check.id, { status: event.target.value })}>
                <option value="not_started">Not started</option>
                <option value="pending">In progress</option>
                <option value="cleared">Cleared</option>
                <option value="review_required">Needs review</option>
                {!check.required && <option value="not_required">Not required</option>}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`screening-notes-${check.id}`}>Internal notes</Label>
              <Textarea id={`screening-notes-${check.id}`} className="min-h-20" value={check.notes || ""} onChange={event => updateLocal(check.id, { notes: event.target.value })} placeholder={`Add notes about the ${checkLabels[check.check_type]?.toLowerCase() || "check"}`} />
            </div>
          </div>
        </div>)}
        {checks.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Screening requirements have not been created for this offer yet.</p>}
        {checks.length > 0 && requiredCleared && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800"><CheckCircle2 className="h-4 w-4" />All required screening checks are cleared.</div>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving || checks.length === 0}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save screening results"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
