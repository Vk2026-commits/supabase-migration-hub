import { FormEvent, useEffect, useState } from "react";
import { Link as LinkIcon, MapPin, Trash2, UserCheck, UserX } from "lucide-react";
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

const formatTimeLabel = (value: string) => {
  const [hourValue, minute = "00"] = value.split(":");
  const hour = Number(hourValue);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
};

const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { value, label: formatTimeLabel(value) };
});

const formatCompanyAddress = (company: any) => {
  if (!company) return "";
  const street = [company.company_address, company.company_address_unit]
    .filter(Boolean)
    .join(" ")
    .trim();
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
  const [changeReason, setChangeReason] = useState("");
  const [saving, setSaving] = useState(false);

  const loadForm = async () => {
    const [interviewResult, companyResult] = await Promise.all([
      (supabase as any)
        .from("interview_schedules")
        .select("*")
        .eq("job_application_id", jobApplicationId)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("company_profiles")
        .select(
          "company_address,company_address_unit,company_city,company_state,company_zip,company_phone",
        )
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
    setChangeReason("");
    if (interview) {
      const scheduled = new Date(interview.scheduled_at);
      setType(interview.interview_type);
      setDate(
        `${scheduled.getFullYear()}-${String(scheduled.getMonth() + 1).padStart(2, "0")}-${String(scheduled.getDate()).padStart(2, "0")}`,
      );
      setTime(
        `${String(scheduled.getHours()).padStart(2, "0")}:${String(scheduled.getMinutes()).padStart(2, "0")}`,
      );
      setDestination(
        interview.interview_type === "video"
          ? interview.meeting_url || ""
          : interview.location || profileAddress,
      );
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
      if (Number.isNaN(scheduledAt.getTime()))
        throw new Error("Choose a valid interview date and time");
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
        attendance_status: "pending",
        attendance_confirmed_at: null,
        attendance_confirmed_by: null,
      };
      if (existing && !changeReason.trim()) throw new Error("Add a reason for the reschedule request");
      const result = existing
        ? await (supabase as any).rpc("request_interview_change", {
            _interview_id: existing.id,
            _request_type: "reschedule",
            _reason: changeReason.trim(),
            _proposed_scheduled_at: scheduledAt.toISOString(),
            _proposed_interview_type: type,
            _proposed_location: type === "in_person" ? submittedDestination : null,
            _proposed_meeting_url: type === "video" ? submittedDestination : null,
          })
        : await (supabase as any).from("interview_schedules").insert(values);
      if (result.error) throw result.error;

      const verb = existing ? "reschedule requested for" : "scheduled for";
      const detail =
        type === "video"
          ? `Join online: ${submittedDestination}`
          : `Location: ${submittedDestination}`;
      const message = `${companyName} ${verb} your ${type === "video" ? "video" : "in-person"} interview for ${jobTitle}: ${scheduledAt.toLocaleString([], { dateStyle: "full", timeStyle: "short" })}. ${detail}${existing ? ` Reason: ${changeReason.trim()}` : ""}${submittedNotes ? ` Notes: ${submittedNotes}` : ""}`;
      const { error: messageError } = await supabase.from("messages").insert({
        company_id: companyId,
        officer_id: officerId,
        job_application_id: jobApplicationId,
        sender_type: "company",
        message,
      });
      if (messageError)
        console.error("Interview saved, but the in-app message could not be created", messageError);

      if (applicationStatus !== "accepted") {
        const { error: stageError } = await supabase
          .from("job_applications")
          .update({ status: "interview_scheduled" })
          .eq("id", jobApplicationId);
        if (stageError)
          console.error(
            "Interview saved, but the application stage could not be updated",
            stageError,
          );
      }

      toast.success(existing ? `Reschedule request sent to ${officerName}` : `Interview scheduled for ${officerName}`);
      setOpen(false);
      onChanged();
    } catch (error: any) {
      toast.error(error.message || "Interview could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const cancelInterview = async () => {
    if (!existing?.id) return;
    if (!changeReason.trim()) {
      toast.error("Add a reason for the cancellation");
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("request_interview_change", {
        _interview_id: existing.id,
        _request_type: "cancel",
        _reason: changeReason.trim(),
      });
      if (error) throw error;
      const message = `${companyName} canceled the interview for ${jobTitle}. Reason: ${changeReason.trim()}`;
      const { error: messageError } = await supabase.from("messages").insert({
        company_id: companyId,
        officer_id: officerId,
        job_application_id: jobApplicationId,
        sender_type: "company",
        message,
      });
      if (messageError) throw messageError;
      toast.success("Interview canceled");
      setOpen(false);
      onChanged();
    } catch (error: any) {
      toast.error(error.message || "Interview could not be updated");
    } finally {
      setSaving(false);
    }
  };

  const respondToOfficerChange = async (decision: "accepted" | "declined") => {
    if (!existing?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("respond_to_interview_change", {
        _interview_id: existing.id,
        _decision: decision,
      });
      if (error) throw error;
      toast.success(decision === "accepted" ? "Officer’s reschedule request accepted" : "Officer’s reschedule request declined");
      setOpen(false);
      onChanged();
    } catch (error: any) {
      toast.error(error.message || "The reschedule response could not be saved");
    } finally {
      setSaving(false);
    }
  };

  const dismissCancellation = async () => {
    if (!existing?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("dismiss_interview_notice", { _interview_id: existing.id });
      if (error) throw error;
      toast.success("Cancellation notice dismissed");
      setOpen(false);
      onChanged();
    } catch (error: any) {
      toast.error(error.message || "The notice could not be dismissed");
    } finally {
      setSaving(false);
    }
  };

  const recordAttendance = async (attendanceStatus: "attended" | "no_show") => {
    if (!existing?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("record_interview_attendance", {
        _interview_id: existing.id,
        _attendance_status: attendanceStatus,
      });
      if (error) throw error;
      toast.success(attendanceStatus === "attended" ? "Attendance confirmed" : "No-show recorded");
      setOpen(false);
      onChanged();
    } catch (error: any) {
      toast.error(error.message || "Attendance could not be recorded");
    } finally {
      setSaving(false);
    }
  };

  const interviewHasStarted = Boolean(existing && new Date(existing.scheduled_at).getTime() <= Date.now());
  const needsAttendance = Boolean(existing && existing.response_status === "accepted" && existing.attendance_status === "pending" && interviewHasStarted);
  const attendanceLabel = existing?.attendance_status === "attended" ? "Attended" : existing?.attendance_status === "no_show" ? "No-show" : null;
  const officerRequestedReschedule = existing?.change_request_type === "reschedule" && existing?.change_requested_by === "officer" && existing?.change_request_status === "pending";
  const companyRequestedReschedule = existing?.change_request_type === "reschedule" && existing?.change_requested_by === "company" && existing?.change_request_status === "pending";
  const officerCancelled = existing?.status === "cancelled" && existing?.cancelled_by === "officer";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-9 px-3 text-xs">
          <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
          {existingInterview?.attendance_status === "attended" || existingInterview?.attendance_status === "no_show"
            ? "Interview record"
            : existingInterview?.status === "cancelled" && existingInterview?.cancelled_by === "officer" && !existingInterview?.cancellation_company_dismissed_at
              ? "Cancellation notice"
            : existingInterview?.change_requested_by === "officer" && existingInterview?.change_request_status === "pending"
              ? "Review change request"
            : existingInterview?.response_status === "accepted" && new Date(existingInterview.scheduled_at).getTime() <= Date.now()
              ? "Confirm attendance"
              : existingInterview?.status === "scheduled" ? "Manage interview" : "Schedule interview"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Manage" : "Schedule"} interview with {officerName}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? "Review the officer’s response and confirm whether they attended after the scheduled interview begins."
              : "Select whether this interview will be online or in person, then send the details to the officer."}
          </DialogDescription>
        </DialogHeader>
        {existing && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span>Officer response:</span>
            <Badge variant={existing.response_status === "accepted" ? "default" : "secondary"}>
              {existing.response_status === "accepted"
                ? "Accepted"
                : existing.response_status === "declined"
                  ? "Declined"
                  : "Awaiting response"}
            </Badge>
            {attendanceLabel && <><span className="ml-2">Attendance:</span><Badge variant={attendanceLabel === "Attended" ? "default" : "destructive"}>{attendanceLabel}</Badge></>}
          </div>
        )}
        {needsAttendance && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-semibold text-amber-950">Did {officerName} attend this interview?</p>
            <p className="mt-1 text-sm text-amber-900/80">Record the result so the company and officer histories stay accurate.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void recordAttendance("attended")} disabled={saving}><UserCheck className="mr-2 h-4 w-4" />Mark attended</Button>
              <Button type="button" variant="destructive" onClick={() => void recordAttendance("no_show")} disabled={saving}><UserX className="mr-2 h-4 w-4" />Mark no-show</Button>
            </div>
          </div>
        )}
        {officerRequestedReschedule && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <p className="font-semibold text-violet-950">{officerName} requested a different interview time</p>
            <p className="mt-1 text-sm text-violet-900/80">Proposed: {new Date(existing.proposed_scheduled_at).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</p>
            <p className="mt-2 whitespace-pre-line text-sm"><strong>Reason:</strong> {existing.change_reason}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={() => void respondToOfficerChange("accepted")} disabled={saving}>Accept new time</Button>
              <Button type="button" variant="outline" onClick={() => void respondToOfficerChange("declined")} disabled={saving}>Keep current time</Button>
            </div>
          </div>
        )}
        {companyRequestedReschedule && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <strong>Waiting for {officerName}</strong>
            <p className="mt-1">Your proposed time is {new Date(existing.proposed_scheduled_at).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}. The current appointment remains active until the officer accepts.</p>
          </div>
        )}
        {officerCancelled && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-950">{officerName} canceled the interview</p>
            <p className="mt-1 whitespace-pre-line text-sm text-red-900"><strong>Reason:</strong> {existing.cancellation_reason}</p>
            {!existing.cancellation_company_dismissed_at && <Button type="button" variant="outline" className="mt-3" onClick={() => void dismissCancellation()} disabled={saving}>Dismiss notice</Button>}
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
              <Input
                id="interview-date"
                name="interview_date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interview-time">Time</Label>
              <select
                id="interview-time"
                name="interview_time"
                className="h-11 w-full rounded-md border bg-background px-3"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select a time
                </option>
                {time && !TIME_OPTIONS.some((option) => option.value === time) && (
                  <option value={time}>{formatTimeLabel(time)}</option>
                )}
                {TIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
              placeholder={
                type === "video"
                  ? "https://meet.example.com/..."
                  : "Street address or office location"
              }
              required
            />
            {type === "in_person" && companyAddress && destination !== companyAddress && (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setDestination(companyAddress)}
              >
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
              onChange={(event) =>
                applyInstructionTemplate(event.target.value as InstructionTemplate)
              }
            >
              <option value="">Custom instructions</option>
              <option value="items_to_bring">Items to bring</option>
              <option value="scheduling_follow_up">Interview confirmation</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Select a template, then edit the message below if needed.
            </p>
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
          {existing?.status === "scheduled" && !attendanceLabel && (
            <div className="space-y-2">
              <Label htmlFor="interview-change-reason">Reason for rescheduling or cancellation *</Label>
              <Textarea
                id="interview-change-reason"
                value={changeReason}
                onChange={(event) => setChangeReason(event.target.value)}
                placeholder="Explain why the interview time needs to change or why it is being canceled."
              />
              <p className="text-xs text-muted-foreground">This reason is shown to the officer.</p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {existing?.status === "scheduled" && !interviewHasStarted ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void cancelInterview()}
                  disabled={saving}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </div>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={saving || Boolean(attendanceLabel) || existing?.status === "cancelled" || officerRequestedReschedule || companyRequestedReschedule}>
              {saving ? "Saving…" : existing ? "Request reschedule" : "Send interview request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
