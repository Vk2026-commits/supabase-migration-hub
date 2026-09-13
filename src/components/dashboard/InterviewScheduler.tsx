import { useEffect, useState } from "react";
import { CalendarCheck2, Link as LinkIcon, MapPin, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Props = { companyId: string; companyName: string; officerId: string; officerName: string; jobApplicationId: string; jobTitle: string; applicationStatus?: string; existingInterview?: any; onChanged: () => void };

export function InterviewScheduler({ companyId, companyName, officerId, officerName, jobApplicationId, jobTitle, applicationStatus, existingInterview, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<any>(null);
  const [type, setType] = useState<"video" | "in_person">("video");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const loadExisting = async () => {
    const { data, error } = await (supabase as any).from("interview_schedules").select("*").eq("job_application_id", jobApplicationId).eq("status", "scheduled").order("scheduled_at", { ascending: false }).limit(1).maybeSingle();
    if (error) { toast.error("Interview details could not be loaded"); return; }
    setExisting(data || null);
    if (data) {
      const scheduled = new Date(data.scheduled_at);
      setType(data.interview_type);
      setDate(`${scheduled.getFullYear()}-${String(scheduled.getMonth() + 1).padStart(2, "0")}-${String(scheduled.getDate()).padStart(2, "0")}`);
      setTime(`${String(scheduled.getHours()).padStart(2, "0")}:${String(scheduled.getMinutes()).padStart(2, "0")}`);
      setDestination(data.interview_type === "video" ? data.meeting_url || "" : data.location || "");
      setNotes(data.notes || "");
    } else { setType("video"); setDate(""); setTime(""); setDestination(""); setNotes(""); }
  };

  useEffect(() => { if (open) void loadExisting(); }, [open, jobApplicationId]);

  const schedule = async () => {
    if (!date || !time || !destination.trim()) { toast.error("Add the interview date, time, and meeting details"); return; }
    if (type === "video") { try { new URL(destination); } catch { toast.error("Enter a complete video meeting link"); return; } }
    setSaving(true);
    try {
      const scheduledAt = new Date(`${date}T${time}`);
      if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) throw new Error("Choose a future interview time");
      const values = { company_id: companyId, officer_id: officerId, job_application_id: jobApplicationId, interview_type: type, scheduled_at: scheduledAt.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, meeting_url: type === "video" ? destination.trim() : null, location: type === "in_person" ? destination.trim() : null, notes: notes.trim() || null, status: "scheduled", response_status: "pending", responded_at: null };
      const result = existing ? await (supabase as any).from("interview_schedules").update(values).eq("id", existing.id) : await (supabase as any).from("interview_schedules").insert(values);
      if (result.error) throw result.error;
      const verb = existing ? "updated" : "scheduled";
      const detail = type === "video" ? `Join online: ${destination.trim()}` : `Location: ${destination.trim()}`;
      const message = `${companyName} ${verb} your ${type === "video" ? "video" : "in-person"} interview for ${jobTitle}: ${scheduledAt.toLocaleString([], { dateStyle: "full", timeStyle: "short" })}. ${detail}${notes.trim() ? ` Notes: ${notes.trim()}` : ""}`;
      const { error: messageError } = await supabase.from("messages").insert({ company_id: companyId, officer_id: officerId, job_application_id: jobApplicationId, sender_type: "company", message });
      if (messageError) throw messageError;
      if (applicationStatus !== "accepted") {
        const { error: stageError } = await supabase.from("job_applications").update({ status: "interview_scheduled" }).eq("id", jobApplicationId);
        if (stageError) throw stageError;
      }
      toast.success(`Interview ${verb} for ${officerName}`); setOpen(false); onChanged();
    } catch (error: any) { toast.error(error.message || "Interview could not be saved"); }
    finally { setSaving(false); }
  };

  const setLifecycleStatus = async (status: "cancelled" | "completed") => {
    if (!existing?.id) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("interview_schedules").update({ status }).eq("id", existing.id);
      if (error) throw error;
      const message = status === "cancelled" ? `${companyName} canceled the interview for ${jobTitle}. Please contact the company if you have questions.` : `${companyName} marked your interview for ${jobTitle} complete.`;
      const { error: messageError } = await supabase.from("messages").insert({ company_id: companyId, officer_id: officerId, job_application_id: jobApplicationId, sender_type: "company", message });
      if (messageError) throw messageError;
      if (status === "completed" && applicationStatus !== "accepted") await supabase.from("job_applications").update({ status: "interview_completed" }).eq("id", jobApplicationId);
      toast.success(status === "cancelled" ? "Interview canceled" : "Interview marked complete"); setOpen(false); onChanged();
    } catch (error: any) { toast.error(error.message || "Interview could not be updated"); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="outline" className="h-9 px-3 text-xs"><LinkIcon className="mr-1.5 h-3.5 w-3.5" />{existingInterview?.status === "scheduled" ? "Manage interview" : "Schedule interview"}</Button></DialogTrigger><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{existing ? "Manage" : "Schedule"} interview with {officerName}</DialogTitle><DialogDescription>{existing ? "Review the officer’s response, revise the details, cancel, or mark the interview complete." : "Select whether this interview will be online or in person, then send the details to the officer."}</DialogDescription></DialogHeader>{existing && <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm"><span>Officer response:</span><Badge variant={existing.response_status === "accepted" ? "default" : "secondary"}>{existing.response_status === "accepted" ? "Accepted" : existing.response_status === "declined" ? "Declined" : "Awaiting response"}</Badge></div>}<div className="space-y-5"><div className="space-y-2"><Label htmlFor="interview-type">Interview format</Label><select id="interview-type" className="h-11 w-full rounded-md border bg-background px-3" value={type} onChange={event => { setType(event.target.value as any); setDestination(""); }}><option value="video">Online/video interview</option><option value="in_person">In-person interview</option></select></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="interview-date">Date</Label><Input id="interview-date" type="date" value={date} onChange={event => setDate(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="interview-time">Time</Label><Input id="interview-time" type="time" value={time} onChange={event => setTime(event.target.value)} /></div></div><div className="space-y-2"><Label htmlFor="interview-destination" className="flex items-center gap-2">{type === "video" ? <LinkIcon className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}{type === "video" ? "Video meeting link" : "Interview location"}</Label><Input id="interview-destination" type={type === "video" ? "url" : "text"} value={destination} onChange={event => setDestination(event.target.value)} placeholder={type === "video" ? "https://meet.example.com/..." : "Street address or office location"} /></div><div className="space-y-2"><Label htmlFor="interview-notes">Instructions (optional)</Label><Textarea id="interview-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Parking, check-in, what to bring, or other instructions" /></div></div><DialogFooter className="gap-2 sm:justify-between">{existing && <div className="flex gap-2"><Button variant="destructive" onClick={() => void setLifecycleStatus("cancelled")} disabled={saving}><Trash2 className="mr-2 h-4 w-4" />Cancel</Button><Button variant="outline" onClick={() => void setLifecycleStatus("completed")} disabled={saving}><CalendarCheck2 className="mr-2 h-4 w-4" />Mark complete</Button></div>}<Button onClick={schedule} disabled={saving}>{saving ? "Saving…" : existing ? "Send updated request" : "Send interview request"}</Button></DialogFooter></DialogContent></Dialog>;
}
