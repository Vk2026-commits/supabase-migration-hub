import { FormEvent, useEffect, useState } from "react";
import { CalendarCheck2, Link as LinkIcon, MapPin, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Props = {
  companyId: string;
  companyName: string;
  officerId: string;
  officerName: string;
  jobApplicationId: string;
  jobTitle: string;
  applicationStatus?: string;
  existingInterview?: any;
  onChanged: () => void;
};

type InterviewType = "video" | "in_person";
type InstructionTemplate = "" | "items_to_bring" | "scheduling_follow_up";

const formatCompanyAddress = (company: any) => {
  if (!company) return "";
  const street = [company.company_address, company.company_address_unit].filter(Boolean).join(" ").trim();
  const cityStateZip = [
    [company.company_city, company.company_state].filter(Boolean).join(", "),
    company.company_zip,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  return [street, cityStateZip].filter(Boolean).join(", ");
};

const makeInstructions = (
  template: Exclude<InstructionTemplate, "">,
  companyName: string,
  companyPhone: string,
) => {
  if (template === "scheduling_follow_up") {
    return "It was a pleasure speaking with you. We look forward to meeting with you at the scheduled date and time.";
  }

  return [
    "Please bring the following items:",
    "• Driver's License",
    "• Social Security Card/Certificate",
    "• Security License Pocket Card",
    "• Duty Gear Unloaded",
    "• Duty Belt",
    "",
    "If you have any questions or concerns, please give us a call.",
    "",
    "Best regards,",
    companyName,
    companyPhone,
  ]
    .filter((line, index, lines) => line || index < lines.length - 1)
    .join("\n")
    .trim();
};

export function InterviewScheduler({
  companyId,
  companyName,
  officerId,
  officerName,
  jobApplicationId,
  jobTitle,
  applicationStatus,
  existingInterview,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<any>(null);
  const [type, setType] = useState<InterviewType>("video");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [destination, setDestination] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [instructionTemplate, setInstructionTemplate] = useState<InstructionTemplate>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const loadForm = async () => {
    const [interviewResult, companyResult] = await Promise.all([
      (supabase as any)
        .from("interview_schedules")
        .select("*")
        .eq("job_application_id", jobApplicationId)
        .eq("status", "scheduled")
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("company_profiles")
        .select("company_address,company_address_unit,company_city,company_state,company_zip,company_phone")
        .eq("id", companyId)
        .maybeSingle(),
    ]);

    if (interviewResult.error) {
      toast.error("Interview details could not be loaded");
      return;
    }

    const profileAddress = formatCompanyAddress(companyResult.data);
    setCompanyAddress(profileAddress);
    setCompanyPhone(companyResult.data?.company_phone || "");

    const interview = interviewResult.data;
    setExisting(interview || null);
    setInstructionTemplate("");
    if (interview) {
      const scheduled = new Date(interview.scheduled_at);
      setType(interview.interview_type);
      setDate(
        `${scheduled.getFullYear()}-${String(scheduled.getMonth() + 1).padStart(2, "0")}-${String(scheduled.getDate()).padStart(2, "0")}`,
      );
      setTime(`${String(scheduled.getHours()).padStart(2, "0")}:${String(scheduled.getMinutes()).padStart(2, "0")}`);
      setDestination(interview.interview_type === "video" ? interview.meeting_url || "" : interview.location || profileAddress);
      setNotes(interview.notes || "");
      return;
    }

    setType("video");
    setDate("");
    setTime("");
    setDestination("");
    setNotes("");
  };

  useEffect(() => {
    if (open) void loadForm();
  }, [open, jobApplicationId, companyId]);

  const changeInterviewType = (nextType: InterviewType) => {
    setType(nextType);
    setDestination(nextType === "in_person" ? companyAddress : "");
  };

  const applyInstructionTemplate = (template: InstructionTemplate) => {
    setInstructionTemplate(template);
    if (template) setNotes(makeInstructions(template, companyName, companyPhone));
  };

  const schedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedDate = String(formData.get("interview_date") || "").trim();
    const submittedTime = String(formData.get("interview_time") || "").trim();
    const submittedDestination = String(formData.get("interview_destination") || "").trim();
    const submittedNotes = String(formData.get("interview_notes") || "").trim();

    if (!submittedDate) {
      toast.error("Choose an interview date");
      return;
    }
    if (!submittedTime) {
      toast.error("Choose an interview time");
      return;
    }
    if (!submittedDestination) {
      toast.error(type === "video" ? "Add the video meeting link" : "Add the interview location");
      return;
    }
    if (type === "video") {
      try {
        new URL(submittedDestination);
      } catch {
        toast.error("Enter a complete video meeting link, including https://");
        return;
      }
    }

    setSaving(true);
    try {
      const scheduledAt = new Date(`${submittedDate}T${submittedTime}`);
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("Choose a valid interview date and time");
      if (scheduledAt <= new Date()) throw new Error("Choose a future interview time");

      const values = {
        company_id: companyId,
        officer_id: officerId,
        job_application_id: jobApplicationId,
        interview_type: type,
        scheduled_at: scheduledAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        meeting_url: type === "video" ? submittedDestination : null,
        location: type === "in_person" ? submittedDestination : null,
        notes: submittedNotes || null,
        status: "scheduled",
        response_status: "pending",
        responded_at: null,
      };
      const result = existing
        ? await (supabase as any).from("interview_schedules").update(values).eq("id", existing.id)
        : await (supabase as any).from("interview_schedules").insert(values);
      if (result.error) throw result.error;

      const verb = existing ? "updated" : "scheduled";
      const detail = type === "video" ? `Join online: ${submittedDestination}` : `Location: ${submittedDestination}`;
      const message = `${companyName} ${verb} your ${type === "video" ? "video" : "in-person"} interview for ${jobTitle}: ${scheduledAt.toLocaleString([], { dateStyle: "full", timeStyle: "short" })}. ${detail}${submittedNotes ? ` Notes: ${submittedNotes}` : ""}`;
      const { error: messageError } = await supabase.from("messages").insert({
        company_id: companyId,
        officer_id: officerId,
        job_application_id: jobApplicationId,
        sender_type: "company",
        message,
      });
      if (messageError) console.error("Interview saved, but the in-app message could not be created", messageError);

      if (applicationStatus !== "accepted") {
        const { error: stageError } = await supabase
          .from("job_applications")
          .update({ status: "interview_scheduled" })
          .eq("id", jobApplicationId);
        if (stageError) console.error("Interview saved, but the application stage could not be updated", stageError);
      }

      toast.success(`Interview ${verb} for ${officerName}`);
      setOpen(false);
      onChanged();
    } catch (error: any) {
      toast.error(error.message || "Interview could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const setLifecycleStatus = async (status: "cancelled" | "completed") => {
    if (!existing?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("interview_schedules").update({ status }).eq("id", existing.id);
      if (error) throw error;
      const message =
        status === "cancelled"
          ? `${companyName} canceled the interview for ${jobTitle}. Please contact the company if you have questions.`
          : `${companyName} marked your interview for ${jobTitle} complete.`;
      const { error: messageError } = await supabase.from("messages").insert({
        company_id: companyId,
        officer_id: officerId,
        job_application_id: jobApplicationId,
        sender_type: "company",
        message,
      });
      if (messageError) throw messageError;
      if (status === "completed" && applicationStatus !== "accepted") {
        await supabase.from("job_applications").update({ status: "interview_completed" }).eq("id", jobApplicationId);
      }
      toast.success(status === "cancelled" ? "Interview canceled" : "Interview marked complete");
      setOpen(false);
      onChanged();
    } catch (error: any) {
      toast.error(error.message || "Interview could not be updated");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 px-3 text-xs">
          <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
          {existingInterview?.status === "scheduled" ? "Manage interview" : "Schedule interview"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Manage" : "Schedule"} interview with {officerName}</DialogTitle>
          <DialogDescription>
            {existing
              ? "Review the officer’s response, revise the details, cancel, or mark the interview complete."
              : "Select whether this interview will be online or in person, then send the details to the officer."}
          </DialogDescription>
        </DialogHeader>
        {existing && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span>Officer response:</span>
            <Badge variant={existing.response_status === "accepted" ? "default" : "secondary"}>
              {existing.response_status === "accepted"
                ? "Accepted"
                : existing.response_status === "declined"
                  ? "Declined"
                  : "Awaiting response"}
            </Badge>
          </div>
        )}
        <form onSubmit={schedule} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="interview-type">Interview format</Label>
            <select
              id="interview-type"
              className="h-11 w-full rounded-md border bg-background px-3"
              value={type}
              onChange={(event) => changeInterviewType(event.target.value as InterviewType)}
            >
              <option value="video">Online/video interview</option>
              <option value="in_person">In-person interview</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="interview-date">Date</Label>
              <Input id="interview-date" name="interview_date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interview-time">Time</Label>
              <Input id="interview-time" name="interview_time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-destination" className="flex items-center gap-2">
              {type === "video" ? <LinkIcon className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
              {type === "video" ? "Video meeting link" : "Interview location"}
            </Label>
            <Input
              id="interview-destination"
              name="interview_destination"
              type={type === "video" ? "url" : "text"}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder={type === "video" ? "https://meet.example.com/..." : "Street address or office location"}
              required
            />
            {type === "in_person" && companyAddress && destination !== companyAddress && (
              <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setDestination(companyAddress)}>
                Use company address
              </button>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-template">Instruction template</Label>
            <select
              id="interview-template"
              className="h-11 w-full rounded-md border bg-background px-3"
              value={instructionTemplate}
              onChange={(event) => applyInstructionTemplate(event.target.value as InstructionTemplate)}
            >
              <option value="">Custom instructions</option>
              <option value="items_to_bring">Items to bring</option>
              <option value="scheduling_follow_up">Interview confirmation</option>
            </select>
            <p className="text-xs text-muted-foreground">Select a template, then edit the message below if needed.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="interview-notes">Instructions (optional)</Label>
            <Textarea
              id="interview-notes"
              name="interview_notes"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setInstructionTemplate("");
              }}
              placeholder="Parking, check-in, what to bring, or other instructions"
              className="min-h-40"
            />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {existing ? (
              <div className="flex gap-2">
                <Button type="button" variant="destructive" onClick={() => void setLifecycleStatus("cancelled")} disabled={saving}>
                  <Trash2 className="mr-2 h-4 w-4" />Cancel
                </Button>
                <Button type="button" variant="outline" onClick={() => void setLifecycleStatus("completed")} disabled={saving}>
                  <CalendarCheck2 className="mr-2 h-4 w-4" />Mark complete
                </Button>
              </div>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : existing ? "Send updated request" : "Send interview request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
