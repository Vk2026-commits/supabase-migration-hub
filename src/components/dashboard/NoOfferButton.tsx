import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
export function NoOfferButton({ applicationId, officerName, onChanged }: { applicationId: string; officerName: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("decline_to_offer", { _application_id: applicationId });
      if (error) throw error;
      toast.success("Decision saved. Portal message sent and email notification queued.");
      setOpen(false);
      onChanged();
    } catch (error: any) {
      toast.error(error?.message || "The decision could not be saved. Please try again.");
    } finally { setBusy(false); }
  };
  return <><Button size="sm" variant="outline" onClick={() => setOpen(true)}>Do not extend offer</Button><Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}><DialogContent><DialogHeader><DialogTitle>Do not extend an offer to {officerName}?</DialogTitle><DialogDescription>This closes this application and notifies the applicant in their portal and by email. Email delivery is queued and usually starts within five minutes.</DialogDescription></DialogHeader><p className="rounded-lg border p-4">We’re unable to extend you an offer at this time, but we look forward to working with you in the future.</p><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Keep application open</Button><Button disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Confirm and notify applicant"}</Button></DialogFooter></DialogContent></Dialog></>;
}
