import { useCallback, useEffect, useState } from "react";
import { Crown, Mail, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type TeamRole = "owner" | "admin" | "hiring_manager" | "reviewer";
type TeamMember = { id: string; user_id: string; email: string; full_name: string; role: TeamRole; status: string; invited_at: string; joined_at: string | null };

const roleLabels: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  hiring_manager: "Hiring manager",
  reviewer: "Reviewer",
};

const roleDescriptions: Record<Exclude<TeamRole, "owner">, string> = {
  admin: "Manage the company profile, team, jobs, applicants, offers, and onboarding.",
  hiring_manager: "Manage jobs, applicants, employment offers, and hiring progress.",
  reviewer: "View candidates, applications, offers, and onboarding progress without making changes.",
};

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function CompanyTeam({ companyId }: { companyId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("hiring_manager");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    const result = await supabase.functions.invoke("manage-company-team", { body: { ...body, company_id: companyId } });
    if (result.error) {
      let message = result.error.message || "Team request failed";
      const context = (result.error as { context?: Response }).context;
      if (context && typeof context.json === "function") {
        const responseBody = await context.clone().json().catch(() => null) as { error?: string } | null;
        if (responseBody?.error) message = responseBody.error;
      }
      throw new Error(message);
    }
    if (result.data?.error) throw new Error(result.data.error);
    return result.data;
  }, [companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke({ action: "list" });
      setMembers(data.members || []);
      setCanManage(Boolean(data.can_manage));
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Company team could not be loaded"));
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => { void load(); }, [load]);

  const invite = async () => {
    if (!email.trim()) return toast.error("Enter the team member’s email address");
    setSubmitting(true);
    try {
      const data = await invoke({ action: "invite", email: email.trim(), role, origin: window.location.origin });
      toast.success(data.message || "Team member added");
      setEmail("");
      await load();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Team member could not be added"));
    } finally {
      setSubmitting(false);
    }
  };

  const updateRole = async (memberId: string, nextRole: Exclude<TeamRole, "owner">) => {
    try {
      await invoke({ action: "update_role", member_id: memberId, role: nextRole });
      toast.success("Team member role updated");
      await load();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Role could not be updated"));
    }
  };

  const remove = async (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.full_name || member.email} from this company team?`)) return;
    try {
      await invoke({ action: "remove", member_id: member.id });
      toast.success("Team member removed");
      await load();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Team member could not be removed"));
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" />Company team</CardTitle>
          <CardDescription>Add staff to the same company account and control what they can do.</CardDescription>
        </CardHeader>
        {canManage && (
          <CardContent>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
              <div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /><h3 className="font-semibold">Add a team member</h3></div>
              <p className="mt-1 text-sm text-muted-foreground">Existing users are added immediately. New users receive a secure We Find Guards account invitation by email.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
                <div className="space-y-2"><Label htmlFor="team-email">Email address</Label><Input id="team-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="manager@company.com" /></div>
                <div className="space-y-2"><Label>Access level</Label><Select value={role} onValueChange={(value) => setRole(value as Exclude<TeamRole, "owner">)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Administrator</SelectItem><SelectItem value="hiring_manager">Hiring manager</SelectItem><SelectItem value="reviewer">Reviewer</SelectItem></SelectContent></Select></div>
                <Button type="button" onClick={invite} disabled={submitting}><Mail className="mr-2 h-4 w-4" />{submitting ? "Adding…" : "Add member"}</Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{roleDescriptions[role]}</p>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Team members</CardTitle><CardDescription>{members.length} {members.length === 1 ? "person has" : "people have"} access to this company.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="py-6 text-center text-muted-foreground">Loading company team…</p> : members.map((member) => (
            <div key={member.id} className="flex flex-wrap items-center gap-4 rounded-xl border p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">{member.role === "owner" ? <Crown className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</div>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{member.full_name || member.email}</p><p className="truncate text-sm text-muted-foreground">{member.email}</p></div>
              <Badge variant={member.status === "active" ? "secondary" : "outline"}>{member.status === "invited" ? "Invitation sent" : "Active"}</Badge>
              {member.role === "owner" ? <Badge>{roleLabels.owner}</Badge> : canManage ? (
                <Select value={member.role} onValueChange={(value) => updateRole(member.id, value as Exclude<TeamRole, "owner">)}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Administrator</SelectItem><SelectItem value="hiring_manager">Hiring manager</SelectItem><SelectItem value="reviewer">Reviewer</SelectItem></SelectContent></Select>
              ) : <Badge variant="outline">{roleLabels[member.role]}</Badge>}
              {canManage && member.role !== "owner" && <Button type="button" size="icon" variant="ghost" onClick={() => remove(member)} aria-label={`Remove ${member.full_name || member.email}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
