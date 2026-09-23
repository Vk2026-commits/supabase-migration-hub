import { useCallback, useEffect, useState } from "react";
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
};

export default function CompanyTeam({ companyId, allowInvites = false }: CompanyTeamProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [serverCanManage, setServerCanManage] = useState(false);
  const [canAssignOwners, setCanAssignOwners] = useState(false);
  const [primaryOwnerUserId, setPrimaryOwnerUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("hiring_manager");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [memberToPromote, setMemberToPromote] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const canManage = allowInvites || serverCanManage;

  const invoke = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await supabase.functions.invoke("manage-company-team", {
        body: { ...body, company_id: companyId },
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
    setLoading(true);
    setLoadError("");
    try {
      const data = await withTimeout(invoke({ action: "list" }), 12000);
      const listedMembers = (data.members || []) as TeamMember[];
      const userIds = listedMembers.map((member) => member.user_id).filter(Boolean);
      const { data: identities } = userIds.length
        ? await supabase.from("profiles").select("id,avatar_url").in("id", userIds)
        : { data: [] };
      const avatarByUser = new Map((identities || []).map((identity) => [identity.id, identity.avatar_url]));
      setMembers(listedMembers.map((member) => ({ ...member, avatar_url: avatarByUser.get(member.user_id) || null })));
      setServerCanManage(Boolean(data.can_manage));
      setCanAssignOwners(Boolean(data.can_assign_owners));
      setPrimaryOwnerUserId(String(data.primary_owner_user_id || ""));
    } catch (error: unknown) {
      const message = errorMessage(error, "Company team could not be loaded");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    void load();
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
    <div className="space-y-6">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Company team
          </CardTitle>
          <CardDescription>
            Add staff to the same company account and control what they can do.
          </CardDescription>
        </CardHeader>
        {canManage && (
          <CardContent>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Add a team member</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Existing users are added immediately. New users receive a secure We Find Guards
                account invitation by email.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="team-email">Email address</Label>
                  <Input
                    id="team-email"
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="hiring_manager">Hiring manager</SelectItem>
                      <SelectItem value="reviewer">Reviewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" onClick={invite} disabled={submitting}>
                  <Mail className="mr-2 h-4 w-4" />
                  {submitting ? "Adding…" : "Add member"}
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{roleDescriptions[role]}</p>
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Team members</CardTitle>
          <CardDescription>
            {members.length} {members.length === 1 ? "person is" : "people are"} listed for this
            company. Only active members have access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
          ) : (
            members.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border p-4"
              >
                <ProfileAvatar name={member.full_name} email={member.email} src={member.avatar_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{member.full_name || member.email}</p>
                  <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                </div>
                <Badge variant={member.status === "active" ? "secondary" : "outline"}>
                  {member.status === "invited"
                    ? "Invite pending"
                    : member.status === "accepted"
                      ? "Account setup in progress"
                      : "Active"}
                </Badge>
                {member.user_id === primaryOwnerUserId || (member.role === "owner" && !canAssignOwners) ? (
                  <Badge className="gap-1"><Crown className="h-3 w-3" />{roleLabels.owner}</Badge>
                ) : canManage ? (
                  <Select
                    value={member.role}
                    onValueChange={(value) =>
                      requestRoleChange(member, value as TeamRole)
                    }
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {canAssignOwners && member.status === "active" && (
                        <SelectItem value="owner">Owner</SelectItem>
                      )}
                      <SelectItem value="admin">Administrator</SelectItem>
                      <SelectItem value="hiring_manager">Hiring manager</SelectItem>
                      <SelectItem value="reviewer">Reviewer</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline">{roleLabels[member.role]}</Badge>
                )}
                {canManage && member.role !== "owner" && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => remove(member)}
                    aria-label={`Remove ${member.full_name || member.email}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

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
