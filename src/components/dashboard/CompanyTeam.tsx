import { isKairos, KAIROS_ACCESS_LABELS } from "@/lib/kairosWorkflow";
import { KairosTeamDirectory } from "./KairosWorkflowOptions";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Crown, Mail, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ProfileAvatar } from "./ProfileAvatar";

type TeamRole = "owner" | "admin" | "hiring_manager" | "reviewer";
type TeamMember = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: TeamRole;
  status: string;
  invited_at: string;
  joined_at: string | null;
  avatar_url?: string | null;
};

const roleLabels: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  hiring_manager: "Hiring manager",
  reviewer: "Reviewer",
};

const roleDescriptions: Record<TeamRole, string> = {
  owner: "Full company access, including owner-level hiring and team management permissions.",
  admin: "Manage the company profile, team, jobs, applicants, offers, and onboarding.",
  hiring_manager: "Manage jobs, applicants, employment offers, and hiring progress.",
  reviewer:
    "View candidates, applications, offers, and onboarding progress without making changes.",
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const withTimeout = <T,>(promise: Promise<T>, milliseconds: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("The company team request timed out. Please try again.")),
      milliseconds,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });

type CompanyTeamProps = {
  companyId: string;
  allowInvites?: boolean;
  readOnly?: boolean;
};

export default function CompanyTeam({ companyId, allowInvites = false, readOnly = false }: CompanyTeamProps) {
  const loadGeneration = useRef(0);
  const accessLabel = (value: TeamRole) => isKairos(companyId) && value !== "owner" ? KAIROS_ACCESS_LABELS[value] : roleLabels[value];
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [serverCanManage, setServerCanManage] = useState(false);
  const [canAssignOwners, setCanAssignOwners] = useState(false);
  const [primaryOwnerUserId, setPrimaryOwnerUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("hiring_manager");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [draftRole, setDraftRole] = useState<TeamRole>("reviewer");
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [memberToPromote, setMemberToPromote] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const canManage = !readOnly && (allowInvites || serverCanManage);

  const invoke = useCallback(
    async (body: Record<string, unknown>, signal?: AbortSignal) => {
      const result = await supabase.functions.invoke("manage-company-team", {
        body: { ...body, company_id: companyId },
        signal,
      });
      if (result.error) {
        let message = result.error.message || "Team request failed";
        const context = (result.error as { context?: Response }).context;
        if (context && typeof context.json === "function") {
          const responseBody = (await context
            .clone()
            .json()
            .catch(() => null)) as { error?: string } | null;
          if (responseBody?.error) message = responseBody.error;
        }
        throw new Error(message);
      }
      if (result.data?.error) throw new Error(result.data.error);
      return result.data;
    },
    [companyId],
  );

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const current = () => generation === loadGeneration.current;
    setLoading(true);
    setLoadError("");
    setServerCanManage(false);
    try {
      // Retry only reads. A slow first connection must not duplicate invitations.
      let data;
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        try {
          data = await withTimeout(invoke({ action: "list" }, controller.signal), 15000);
          break;
        } catch (error) {
          if (!current()) return;
          if (attempt || !/timed out|fetch|network/i.test(errorMessage(error, ""))) throw error;
        } finally { controller.abort(); }
      }
      if (!current()) return;
      const listedMembers = (data.members || []) as TeamMember[];
      // Show names and access immediately; optional avatars never block the roster.
      setMembers(listedMembers);
      setServerCanManage(Boolean(data.can_manage));
      setCanAssignOwners(Boolean(data.can_assign_owners));
      setPrimaryOwnerUserId(String(data.primary_owner_user_id || ""));
      setLoading(false);
      const userIds = listedMembers.map((member) => member.user_id).filter(Boolean);
      if (userIds.length) {
        const controller = new AbortController();
        try {
          const { data: identities } = await withTimeout(Promise.resolve(supabase.from("profiles").select("id,avatar_url").in("id", userIds).abortSignal(controller.signal)), 5000);
          if (!current()) return;
          const avatarByUser = new Map((identities || []).map((identity) => [identity.id, identity.avatar_url]));
          setMembers(listedMembers.map((member) => ({ ...member, avatar_url: avatarByUser.get(member.user_id) || null })));
        } catch { /* Initials remain usable if photos cannot load. */ }
        finally { controller.abort(); }
      }
    } catch (error: unknown) {
      if (!current()) return;
      const message = errorMessage(error, "Company team could not be loaded");
      setLoadError(message);
      toast.error(message);
    } finally {
      if (current()) setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    setMembers([]);
    void load();
    return () => { loadGeneration.current++; };
  }, [load]);

  const invite = async () => {
    if (!email.trim()) {
      toast.error("Enter the team member’s email address");
      return;
    }
    setSubmitting(true);
    try {
      const data = await invoke({ action: "invite", email: email.trim(), role });
      toast.success(data.message || "Team member added");
      setEmail("");
      await load();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Team member could not be added"));
    } finally {
      setSubmitting(false);
    }
  };

  const updateRole = async (memberId: string, nextRole: TeamRole) => {
    try {
      await invoke({ action: "update_role", member_id: memberId, role: nextRole });
      toast.success("Team member role updated");
      await load();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Role could not be updated"));
    }
  };

  const requestRoleChange = (member: TeamMember, nextRole: TeamRole) => {
    if (nextRole === "owner") {
      setMemberToPromote(member);
      return;
    }
    void updateRole(member.id, nextRole);
  };

  const confirmOwnerPromotion = async () => {
    if (!memberToPromote) return;
    const member = memberToPromote;
    setMemberToPromote(null);
    await updateRole(member.id, "owner");
  };

  const remove = async (member: TeamMember) => {
    setMemberToRemove(member);
  };

  const confirmRemove = async () => {
    if (!memberToRemove) return;
    setRemoving(true);
    try {
      const data = await invoke({
        action: "remove",
        member_id: memberToRemove.id,
        confirm_remove: true,
      });
      toast.success(data.message || "Team member removed");
      setMemberToRemove(null);
      await load();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Team member could not be removed"));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="overflow-hidden border bg-background">
      {isKairos(companyId) && <KairosTeamDirectory />}
      <Card className="rounded-none border-0 border-b bg-transparent shadow-none">
        <CardHeader className="px-4 py-4 sm:px-5">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {readOnly ? "Company owners and team" : "Company team"}
          </CardTitle>
          <CardDescription>
            {readOnly ? "Everyone linked to this company, with their saved access role. Add people or change roles under Team; the primary hiring contact is managed separately." : "Add staff to the same company account and control what they can do."}
          </CardDescription>
        </CardHeader>
        {canManage && (
          <CardContent className="px-4 pb-4 sm:px-5">
            <div className="border-t bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Add a team member</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Existing users are added immediately. New users receive a secure We Find Guards
                account invitation by email.
              </p>
              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,1fr)_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="team-email">Email address</Label>
                  <Input
                    id="team-email"
                    className="h-10"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="manager@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Access level</Label>
                  <Select
                    value={role}
                    onValueChange={(value) => setRole(value as Exclude<TeamRole, "owner">)}
                  >
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{accessLabel("admin")}</SelectItem>
                      <SelectItem value="hiring_manager">{accessLabel("hiring_manager")}</SelectItem>
                      <SelectItem value="reviewer">{accessLabel("reviewer")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="h-10" type="button" onClick={invite} disabled={submitting}>
                  <Mail className="mr-2 h-4 w-4" />
                  {submitting ? "Adding…" : "Add member"}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{roleDescriptions[role]}</p>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="rounded-none border-0 bg-transparent shadow-none">
        <CardHeader className="border-b px-4 py-4 sm:px-5">
          <CardTitle>Team members</CardTitle>
          <CardDescription>
            {loading ? "Loading saved team memberships…" : loadError ? "Team membership count unavailable." : `${members.length} ${members.length === 1 ? "person is" : "people are"} listed for this company.`} Only active members have access.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="py-6 text-center text-muted-foreground">Loading company team…</p>
          ) : loadError ? (
            <div className="flex flex-col items-center rounded-xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
              <AlertCircle className="h-6 w-6 text-amber-700" />
              <p className="mt-2 font-medium text-amber-950">The team roster could not be loaded</p>
              <p className="mt-1 text-sm text-amber-900/75">{loadError}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4 bg-background" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-4 w-4" />Retry
              </Button>
            </div>
          ) : members.length === 0 ? (
            <p className="p-6 text-muted-foreground">No team memberships found for this company.</p>
          ) : (
            members.map((member) => (
              <div
                key={member.id}
                className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-slate-50/70 sm:px-5 xl:grid-cols-[40px_minmax(0,1fr)_150px_160px_112px]"
              >
                <ProfileAvatar name={member.full_name} email={member.email} src={member.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{member.full_name || member.email}</p>
                  <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                </div>
                <Badge className="w-fit xl:col-auto col-start-2" variant={member.status === "active" ? "secondary" : "outline"}>
                  {member.status === "invited"
                    ? "Invite pending"
                    : member.status === "accepted"
                      ? "Account setup in progress"
                      : "Active"}
                </Badge>
                <Badge variant={member.role === "owner" ? "default" : "outline"} className="col-start-2 w-fit gap-1 xl:col-auto">
                  {member.role === "owner" && <Crown className="h-3 w-3" />}{roleLabels[member.role]}
                </Badge>
                <div className="col-start-2 flex min-h-10 items-center justify-start gap-1 xl:col-auto xl:justify-end">
                  {canManage && member.user_id !== primaryOwnerUserId && (member.role !== "owner" || canAssignOwners) && (
                    <Button type="button" variant="ghost" size="sm" aria-label={`Edit access for ${member.full_name || member.email}`} onClick={() => { setDraftRole(member.role); setEditingMember(member); }}>Edit</Button>
                  )}
                {canManage && member.role !== "owner" && member.user_id !== primaryOwnerUserId && (
                  <Button
                    type="button"
                    size="icon"
                    className="h-10 w-10"
                    variant="ghost"
                    onClick={() => remove(member)}
                    aria-label={`Remove ${member.full_name || member.email}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(editingMember)} onOpenChange={(open) => { if (!open) setEditingMember(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit team access</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{editingMember?.full_name || editingMember?.email}</p>
          <Label htmlFor="edit-team-role">Access level</Label>
          <Select value={draftRole} onValueChange={(value) => setDraftRole(value as TeamRole)}>
            <SelectTrigger id="edit-team-role" className="h-auto min-h-10 w-full [&>span]:whitespace-normal [&>span]:text-left"><SelectValue /></SelectTrigger>
            <SelectContent>
              {canAssignOwners && editingMember?.status === "active" && <SelectItem value="owner">Owner</SelectItem>}
              <SelectItem value="admin">{accessLabel("admin")}</SelectItem>
              <SelectItem value="hiring_manager">{accessLabel("hiring_manager")}</SelectItem>
              <SelectItem value="reviewer">{accessLabel("reviewer")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{roleDescriptions[draftRole]}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>Cancel</Button>
            <Button disabled={!editingMember || draftRole === editingMember.role} onClick={() => { if (!editingMember) return; requestRoleChange(editingMember, draftRole); setEditingMember(null); }}>Save access</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => {
          if (!open && !removing) setMemberToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {memberToRemove?.status === "invited"
                ? "Cancel this invitation?"
                : "Remove team access?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove?.status === "invited"
                ? `This cancels the unused invitation for ${memberToRemove.email}. You can send a fresh invitation later.`
                : `${memberToRemove?.email} will immediately lose access to this company. Their personal We Find Guards login will not be deleted.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removing}
              onClick={(event) => {
                event.preventDefault();
                void confirmRemove();
              }}
            >
              {removing
                ? "Removing…"
                : memberToRemove?.status === "invited"
                  ? "Cancel invitation"
                  : "Remove access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(memberToPromote)}
        onOpenChange={(open) => {
          if (!open) setMemberToPromote(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make this person an owner?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToPromote?.full_name || memberToPromote?.email} will receive full owner-level
              access to this company workspace. Their access to any other company remains unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmOwnerPromotion()}>
              Make owner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
