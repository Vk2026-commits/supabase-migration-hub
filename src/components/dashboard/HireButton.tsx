import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Briefcase } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

interface HireButtonProps {
  officerId: string;
  officerName: string;
  companyId: string;
}

const HireButton = ({ officerId, officerName, companyId }: HireButtonProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hireDate, setHireDate] = useState(new Date().toISOString().split('T')[0]);
  const [positionTitle, setPositionTitle] = useState("Security Officer");
  const [hourlyRate, setHourlyRate] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [scheduledPost, setScheduledPost] = useState("");
  const [scheduledShift, setScheduledShift] = useState("");
  const [acceptanceDeadline, setAcceptanceDeadline] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [representativeTitle, setRepresentativeTitle] = useState("Authorized Hiring Representative");
  const [authorized, setAuthorized] = useState(false);

  const prepareDialog = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen || representativeName) return;
    const { data } = await supabase.from("company_profiles").select("company_name,contact_person_name,contact_person_title").eq("id", companyId).maybeSingle();
    setRepresentativeName(/kairos security/i.test(data?.company_name || "") ? "Erika Garces" : data?.contact_person_name || "");
    setRepresentativeTitle(data?.contact_person_title || "Authorized Hiring Representative");
  };

  const handleHire = async () => {
    if (!hireDate || !positionTitle.trim() || !hourlyRate || !supervisorName.trim() || !scheduledPost.trim() || !scheduledShift.trim() || !acceptanceDeadline || !representativeName.trim() || !authorized) {
      toast.error("Complete and authorize all offer details before hiring");
      return;
    }
    try {
      setLoading(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to hire officers");
        return;
      }

      const { error } = await supabase.from("hires").insert({
        officer_id: officerId,
        company_id: companyId,
        hired_by_user_id: session.user.id,
        hire_date: hireDate,
        position_title: positionTitle,
        status: "active",
        offer_prepared_at: new Date().toISOString(),
        offer_terms: {
          startDate: hireDate,
          offeredPosition: positionTitle.trim(),
          hourlyRate,
          supervisorName: supervisorName.trim(),
          scheduledPost: scheduledPost.trim(),
          scheduledShift: scheduledShift.trim(),
          acceptanceDeadline,
          representativeName: representativeName.trim(),
          representativeTitle: representativeTitle.trim() || "Authorized Hiring Representative",
          employerSignatureName: representativeName.trim(),
        },
      });

      if (error) throw error;

      toast.success(`Successfully hired ${officerName}!`);
      setOpen(false);
    } catch (error) {
      console.error("Error hiring officer:", error);
      toast.error("Failed to mark as hired");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={prepareDialog}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Briefcase className="h-4 w-4 mr-2" />
          Mark as Hired
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mark Officer as Hired</DialogTitle>
          <DialogDescription>
            Prepare the offer before {officerName} receives employee onboarding. The officer will review and accept these locked company terms.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <DatePicker id="hire-date" label="Hire Date" value={hireDate} onChange={setHireDate} />
          <div className="space-y-2">
            <Label htmlFor="position">Position Title</Label>
            <Input
              id="position"
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder="Security Officer"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="hourly-rate">Hourly Rate</Label><Input id="hourly-rate" type="number" min="0" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="18.00" /></div>
            <div className="space-y-2"><Label htmlFor="supervisor">Supervisor</Label><Input id="supervisor" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="Supervisor name" /></div>
            <div className="space-y-2"><Label htmlFor="post">Post or Assignment</Label><Input id="post" value={scheduledPost} onChange={(e) => setScheduledPost(e.target.value)} placeholder="Client site or assignment" /></div>
            <div className="space-y-2"><Label htmlFor="shift">Expected Shift</Label><Input id="shift" value={scheduledShift} onChange={(e) => setScheduledShift(e.target.value)} placeholder="Monday-Friday, 8:00 AM-4:00 PM" /></div>
            <DatePicker id="acceptance-deadline" label="Accept By" value={acceptanceDeadline} onChange={setAcceptanceDeadline} />
            <div className="space-y-2"><Label htmlFor="representative">Hiring Representative</Label><Input id="representative" value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} placeholder="Authorized representative" /></div>
            <div className="space-y-2 sm:col-span-2"><Label htmlFor="representative-title">Representative Title</Label><Input id="representative-title" value={representativeTitle} onChange={(e) => setRepresentativeTitle(e.target.value)} /></div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-4">
            <Checkbox checked={authorized} onCheckedChange={(value) => setAuthorized(Boolean(value))} />
            <span className="text-sm"><strong className="block">Approve and sign this offer for the company</strong>I confirm these hiring terms are accurate and authorize my typed name as the company representative signature.</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleHire} disabled={loading}>
            {loading ? "Preparing offer..." : "Prepare Offer & Confirm Hire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HireButton;
