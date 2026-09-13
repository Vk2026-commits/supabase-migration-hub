import { useState } from "react";
import { Link as LinkIcon, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Props = { companyId: string; companyName: string; officerId: string; officerName: string; jobApplicationId: string; jobTitle: string; applicationStatus?: string; onChanged: () => void };

export function InterviewScheduler({ companyId, companyName, officerId, officerName, jobApplicationId, jobTitle, applicationStatus, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"video" | "in_person">("video");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const schedule = async () => {
    if (!date || !time || !destination.trim()) { toast.error("Add the interview date, time, and meeting details"); return; }
    if (type === "video") {
      try { new URL(destination); } catch { toast.error("Enter a complete video meeting link"); return; }
    }
    setSaving(true);
    try {
      const scheduledAt = new Date(`${date}T${time}`);
      if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) throw new Error("Choose a future interview time");
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { error } = await (supabase as any).from("interview_schedules").insert({
        company_id: companyId, officer_id: officerId, job_application_id: jobApplicationId,
        interview_type: type, scheduled_at: scheduledAt.toISOString(), timezone,
        meeting_url: type === "video" ? destination.trim() : null,
        location: type === "in_person" ? destination.trim() : null, notes: notes.trim() || null,
      });
      if (error) throw error;
      const detail = type === "video" ? `Join online: ${destination.trim()}` : `Location: ${destination.trim()}`;
      const message = `${companyName} scheduled a ${type === "video" ? "video" : "in-person"} interview for ${jobTitle} on ${scheduledAt.toLocaleString([], { dateStyle: "full", timeStyle: "short" })}. ${detail}${notes.trim() ? ` Notes: ${notes.trim()}` : ""}`;
      const { error: messageError } = await supabase.from("messages").insert({ company_id: companyId, officer_id: officerId, job_application_id: jobApplicationId, sender_type: "company", message });
      if (messageError) throw messageError;
      if (applicationStatus !== "accepted") {
        const { error: stageError } = await supabase.from("job_applications").update({ status: "interview_scheduled" }).eq("id", jobApplicationId);
        if (stageError) throw stageError;
      }
      toast.success(`Interview scheduled with ${officerName}`);
      setOpen(false); onChanged();
    } catch (error: any) { toast.error(error.message || "Interview could not be scheduled"); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (nextOpen) { setType("video"); setDestination(""); } }}><DialogTrigger asChild><Button size="sm" variant="outline" className="h-8 px-2 text-xs"><LinkIcon className="mr-1.5 h-3.5 w-3.5" />Schedule interview</Button></DialogTrigger><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Schedule interview with {officerName}</DialogTitle><DialogDescription>Select whether this interview will be online or in person, then send the details to the officer.</DialogDescription></DialogHeader><div className="space-y-5"><div className="space-y-2"><Label htmlFor="interview-type">Interview format</Label><select id="interview-type" className="h-11 w-full rounded-md border bg-background px-3" value={type} onChange={event => { setType(event.target.value as any); setDestination(""); }}><option value="video">Online/video interview</option><option value="in_person">In-person interview</option></select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="interview-date">Date</Label><Input id="interview-date" type="date" value={date} onChange={event => setDate(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="interview-time">Time</Label><Input id="interview-time" type="time" value={time} onChange={event => setTime(event.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="interview-destination" className="flex items-center gap-2">{type === "video" ? <LinkIcon className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}{type === "video" ? "Video meeting link" : "Interview location"}</Label><Input id="interview-destination" type={type === "video" ? "url" : "text"} value={destination} onChange={event => setDestination(event.target.value)} placeholder={type === "video" ? "https://meet.example.com/..." : "Street address or office location"} /></div><div className="space-y-2"><Label htmlFor="interview-notes">Instructions (optional)</Label><Textarea id="interview-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Parking, check-in, what to bring, or other instructions" /></div><Button className="w-full" onClick={schedule} disabled={saving}>{saving ? "Scheduling…" : type === "video" ? "Send Interview Link" : "Schedule In-Person Interview"}</Button></div></DialogContent></Dialog>;
}
