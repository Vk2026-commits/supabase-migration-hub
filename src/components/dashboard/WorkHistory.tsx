import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Briefcase, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface WorkHistoryProps {
  officerId: string;
  userId: string;
  onEnsureProfile?: () => Promise<any>;
}

interface WorkHistoryEntry {
  id?: string;
  officer_id?: string;
  company_name: string;
  position_title: string;
  start_date: string;
  end_date: string;
  company_address: string;
  company_city: string;
  company_state: string;
  company_zip: string;
  supervisor_name: string;
  supervisor_phone: string;
  company_phone: string;
  reason_for_leaving: string;
  job_description: string;
  may_contact: boolean;
}

export const WorkHistory = ({ officerId, userId, onEnsureProfile }: WorkHistoryProps) => {
  const [workHistory, setWorkHistory] = useState<WorkHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentOfficerId, setCurrentOfficerId] = useState(officerId);
  const [currentEntry, setCurrentEntry] = useState<WorkHistoryEntry>({
    company_name: "",
    position_title: "",
    start_date: "",
    end_date: "",
    company_address: "",
    company_city: "",
    company_state: "",
    company_zip: "",
    supervisor_name: "",
    supervisor_phone: "",
    company_phone: "",
    reason_for_leaving: "",
    job_description: "",
    may_contact: true,
  });

  useEffect(() => {
    if (officerId) {
      setCurrentOfficerId(officerId);
      loadWorkHistory();
    }
  }, [officerId]);

  const ensureOfficerId = async () => {
    if (currentOfficerId) return currentOfficerId;
    
    if (onEnsureProfile) {
      const profile = await onEnsureProfile();
      if (profile?.id) {
        setCurrentOfficerId(profile.id);
        return profile.id;
      }
    }
    return null;
  };

  const loadWorkHistory = async () => {
    const id = await ensureOfficerId();
    if (!id) return;

    const { data, error } = await supabase
      .from("work_history")
      .select("*")
      .eq("officer_id", id)
      .order("start_date", { ascending: false });

    if (error) {
      toast.error("Failed to load work history");
      return;
    }

    setWorkHistory((data || []) as WorkHistoryEntry[]);
  };

  const resetForm = () => {
    setCurrentEntry({
      company_name: "",
      position_title: "",
      start_date: "",
      end_date: "",
      company_address: "",
      company_city: "",
      company_state: "",
      company_zip: "",
      supervisor_name: "",
      supervisor_phone: "",
      company_phone: "",
      reason_for_leaving: "",
      job_description: "",
      may_contact: true,
    });
  };

  const handleSave = async () => {
    if (!currentEntry.company_name) {
      toast.error("Company name is required");
      return;
    }

    const id = await ensureOfficerId();
    if (!id) {
      toast.error("Please save your profile first");
      return;
    }

    setLoading(true);
    try {
      const workData = {
        officer_id: id,
        company_name: currentEntry.company_name,
        position_title: currentEntry.position_title,
        start_date: currentEntry.start_date || null,
        end_date: currentEntry.end_date || null,
        company_address: currentEntry.company_address,
        company_city: currentEntry.company_city,
        company_state: currentEntry.company_state,
        company_zip: currentEntry.company_zip,
        supervisor_name: currentEntry.supervisor_name,
        supervisor_phone: currentEntry.supervisor_phone,
        company_phone: currentEntry.company_phone,
        reason_for_leaving: currentEntry.reason_for_leaving,
        job_description: currentEntry.job_description,
        may_contact: currentEntry.may_contact,
      };

      if (currentEntry.id) {
        // Update existing entry
        const { error } = await supabase
          .from("work_history")
          .update(workData)
          .eq("id", currentEntry.id);

        if (error) throw error;
        toast.success("Work history updated successfully");
      } else {
        // Insert new entry
        const { error } = await supabase
          .from("work_history")
          .insert(workData);

        if (error) throw error;
        toast.success("Work history added successfully");
      }

      resetForm();
      loadWorkHistory();
    } catch (error: any) {
      toast.error("Failed to save work history");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this work history entry?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("work_history")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Work history deleted successfully");
      loadWorkHistory();
    } catch (error: any) {
      toast.error("Failed to delete work history");
    }
  };

  const handleEdit = (entry: WorkHistoryEntry) => {
    setCurrentEntry(entry);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            {currentEntry.id ? "Edit Work History" : "Add Work History"}
          </CardTitle>
          <CardDescription>
            Please provide your last 3 previous employers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company_name">Company Name *</Label>
              <Input
                id="company_name"
                value={currentEntry.company_name}
                onChange={(e) => setCurrentEntry({ ...currentEntry, company_name: e.target.value })}
                placeholder="Enter company name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="position_title">Position Title</Label>
              <Input
                id="position_title"
                value={currentEntry.position_title}
                onChange={(e) => setCurrentEntry({ ...currentEntry, position_title: e.target.value })}
                placeholder="Enter position title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={currentEntry.start_date}
                onChange={(e) => setCurrentEntry({ ...currentEntry, start_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={currentEntry.end_date}
                onChange={(e) => setCurrentEntry({ ...currentEntry, end_date: e.target.value })}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="company_address">Company Address</Label>
              <Input
                id="company_address"
                value={currentEntry.company_address}
                onChange={(e) => setCurrentEntry({ ...currentEntry, company_address: e.target.value })}
                placeholder="Street address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_city">City</Label>
              <Input
                id="company_city"
                value={currentEntry.company_city}
                onChange={(e) => setCurrentEntry({ ...currentEntry, company_city: e.target.value })}
                placeholder="City"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_state">State</Label>
              <Input
                id="company_state"
                value={currentEntry.company_state}
                onChange={(e) => setCurrentEntry({ ...currentEntry, company_state: e.target.value })}
                placeholder="State"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_zip">Zip Code</Label>
              <Input
                id="company_zip"
                value={currentEntry.company_zip}
                onChange={(e) => setCurrentEntry({ ...currentEntry, company_zip: e.target.value })}
                placeholder="Zip code"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company_phone">Company Phone</Label>
              <Input
                id="company_phone"
                type="tel"
                value={currentEntry.company_phone}
                onChange={(e) => setCurrentEntry({ ...currentEntry, company_phone: e.target.value })}
                placeholder="Company phone"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supervisor_name">Supervisor Name</Label>
              <Input
                id="supervisor_name"
                value={currentEntry.supervisor_name}
                onChange={(e) => setCurrentEntry({ ...currentEntry, supervisor_name: e.target.value })}
                placeholder="Supervisor name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supervisor_phone">Supervisor Phone</Label>
              <Input
                id="supervisor_phone"
                type="tel"
                value={currentEntry.supervisor_phone}
                onChange={(e) => setCurrentEntry({ ...currentEntry, supervisor_phone: e.target.value })}
                placeholder="Supervisor phone"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="job_description">Job Description</Label>
              <Textarea
                id="job_description"
                value={currentEntry.job_description}
                onChange={(e) => setCurrentEntry({ ...currentEntry, job_description: e.target.value })}
                placeholder="Describe your responsibilities and duties"
                rows={3}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="reason_for_leaving">Reason for Leaving</Label>
              <Textarea
                id="reason_for_leaving"
                value={currentEntry.reason_for_leaving}
                onChange={(e) => setCurrentEntry({ ...currentEntry, reason_for_leaving: e.target.value })}
                placeholder="Reason for leaving"
                rows={2}
              />
            </div>

            <div className="flex items-center space-x-2 md:col-span-2">
              <Checkbox
                id="may_contact"
                checked={currentEntry.may_contact}
                onCheckedChange={(checked) => 
                  setCurrentEntry({ ...currentEntry, may_contact: checked as boolean })
                }
              />
              <Label htmlFor="may_contact" className="text-sm font-normal cursor-pointer">
                Employer may be contacted
              </Label>
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="h-12 flex-1 text-base"
              onClick={handleSave} 
              disabled={loading}
            >
              {loading ? "Saving..." : "Save Work History"}
            </Button>
            {currentEntry.id && (
              <Button 
                onClick={resetForm} 
                variant="outline"
              >
                Cancel Edit
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {workHistory.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Previous Employers</CardTitle>
            <CardDescription>
              Your saved work history ({workHistory.length} {workHistory.length === 1 ? 'entry' : 'entries'})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {workHistory.map((entry) => (
              <div
                key={entry.id}
                className="border rounded-lg p-4 space-y-2 hover:bg-muted/50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold">{entry.company_name}</h4>
                    {entry.position_title && (
                      <p className="text-sm text-muted-foreground">{entry.position_title}</p>
                    )}
                    {(entry.start_date || entry.end_date) && (
                      <p className="text-sm text-muted-foreground">
                        {entry.start_date} - {entry.end_date || "Present"}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(entry)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => entry.id && handleDelete(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            
            {!currentEntry.id && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Another Previous Employer
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
