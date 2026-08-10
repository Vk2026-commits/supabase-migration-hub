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
import { toast } from "sonner";
import { Briefcase } from "lucide-react";

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

  const handleHire = async () => {
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Briefcase className="h-4 w-4 mr-2" />
          Mark as Hired
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Officer as Hired</DialogTitle>
          <DialogDescription>
            Record that you've hired {officerName}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="hire-date">Hire Date</Label>
            <Input
              id="hire-date"
              type="date"
              value={hireDate}
              onChange={(e) => setHireDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="position">Position Title</Label>
            <Input
              id="position"
              value={positionTitle}
              onChange={(e) => setPositionTitle(e.target.value)}
              placeholder="Security Officer"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleHire} disabled={loading}>
            {loading ? "Recording..." : "Confirm Hire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HireButton;
