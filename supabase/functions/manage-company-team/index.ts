import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const clean = (value: unknown) => String(value ?? "").trim();
const roles = new Set(["admin", "hiring_manager", "reviewer"]);
const invitationSetupWindowMs = 15 * 60 * 1000;
// Keep invitations on the We Find Guards domain. APP_URL supports a controlled
// deployment override without trusting a client-provided redirect origin.
const appUrl = (Deno.env.get("APP_URL") || "https://wefindguards.com").replace(/\/+$/, "");
const teamInvitationRedirect = `${appUrl}/reset-password?invite=company-team`;
const invitationSetupExpired = (acceptedAt: string | null | undefined) => {
  const acceptedAtMs = acceptedAt ? Date.parse(acceptedAt) : Number.NaN;
  return !Number.isFinite(acceptedAtMs) || Date.now() - acceptedAtMs > invitationSetupWindowMs;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user)
      return json({ error: "Sign in to manage the company team" }, 401);

    const body = await request.json();
    const action = clean(body.action);
    const companyId = clean(body.company_id);
    if (!companyId) return json({ error: "Company is required" }, 400);

    const { data: company } = await admin
      .from("company_profiles")
      .select("id,user_id,company_name")
      .eq("id", companyId)
      .maybeSingle();
    if (!company) return json({ error: "Company not found" }, 404);
    const isOwner = company.user_id === authData.user.id;
    const { data: actingMember } = isOwner
      ? { data: null }
      : await admin
          .from("company_members")
          .select("role,status,invite_accepted_at")
          .eq("company_id", companyId)
          .eq("user_id", authData.user.id)
          .maybeSingle();

    if (action === "accept_invitation") {
      if (isOwner || actingMember?.status === "active") {
        return json({ success: true, message: "Invitation already activated" });
      }
      if (actingMember?.status === "accepted") {
        return json(
          {
            error:
              "This invitation link has already been used. Complete account setup from the open page.",
          },
          409,
        );
      }
      if (actingMember?.status !== "invited") {
        return json({ error: "This team invitation is no longer available" }, 403);
      }
      const { error: acceptanceError } = await admin
        .from("company_members")
        .update({
          status: "accepted",
          invite_accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("user_id", authData.user.id);
      if (acceptanceError) throw acceptanceError;
      return json({ success: true, message: "Invitation accepted" });
    }

    if (action === "activate_invitation") {
      if (isOwner || actingMember?.status === "active") {
        return json({ success: true, message: "Invitation already activated" });
      }
      if (actingMember?.status !== "accepted") {
        return json({ error: "This team invitation is no longer available" }, 403);
      }
      if (invitationSetupExpired(actingMember.invite_accepted_at)) {
        const { error: deleteExpiredUserError } = await admin.auth.admin.deleteUser(
          authData.user.id,
        );
        if (deleteExpiredUserError) throw deleteExpiredUserError;
        return json(
          {
            error:
              "Account setup expired. Ask the team administrator to send you a new invitation.",
          },
          410,
        );
      }
      const { error: activationError } = await admin
        .from("company_members")
        .update({
          status: "active",
          joined_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("user_id", authData.user.id);
      if (activationError) throw activationError;
      return json({ success: true, message: "Invitation activated" });
    }

    const hasAccess = isOwner || actingMember?.status === "active";
    const canManage = isOwner || actingMember?.role === "admin";
    if (!hasAccess) return json({ error: "Company access denied" }, 403);

    if (action === "list") {
      const { data: members, error: memberError } = await admin
        .from("company_members")
        .select("id,user_id,email,role,status,invited_at,invite_accepted_at,joined_at")
        .eq("company_id", companyId)
        .order("invited_at");
      if (memberError) throw memberError;
      const memberUserIds = (members || []).map((member) => member.user_id);
      const { data: profileRows } = memberUserIds.length
        ? await admin.from("profiles").select("id,full_name,email").in("id", memberUserIds)
        : { data: [] };
      const profileById = new Map((profileRows || []).map((profile) => [profile.id, profile]));
      return json({
        company_name: company.company_name,
        can_manage: canManage,
        members: (members || []).map((member) => ({
          ...member,
          full_name: profileById.get(member.user_id)?.full_name || "",
        })),
      });
    }

    if (!canManage)
      return json(
        { error: "Only the company owner or an administrator can manage team members" },
        403,
      );

    if (action === "invite") {
      const email = clean(body.email).toLowerCase();
      const role = clean(body.role);
      const atIndex = email.indexOf("@");
      const hasValidEmailShape =
        atIndex > 0 && email.indexOf(".", atIndex + 2) > atIndex + 1 && !email.includes(" ");
      if (!hasValidEmailShape) return json({ error: "Enter a valid email address" }, 400);
      if (!roles.has(role)) return json({ error: "Choose a valid team role" }, 400);

      const { data: existingUserId, error: lookupError } = await admin.rpc(
        "find_company_team_user_by_email",
        { p_email: email },
      );
      if (lookupError) throw new Error("Team member lookup failed. Please try again.");
      let invitedUser = existingUserId ? { id: existingUserId as string, email } : null;
      let renewedUnusedInvitation = false;

      if (invitedUser) {
        const { data: pendingMembership, error: membershipLookupError } = await admin
          .from("company_members")
          .select("status")
          .eq("company_id", companyId)
          .eq("user_id", invitedUser.id)
          .maybeSingle();
        if (membershipLookupError) throw membershipLookupError;
        if (pendingMembership?.status === "invited") {
          return json(
            {
              error:
                "An invitation is already pending for this email. The recipient must use the latest We Find Guards invitation email to create a password before gaining access.",
            },
            409,
          );
        }

        if (pendingMembership?.status === "accepted") {
          if (!invitationSetupExpired(pendingMembership.invite_accepted_at)) {
            return json(
              {
                error:
                  "This invitation link was already accepted and account setup is still in progress. The recipient must finish creating the account or wait for the setup window to expire before requesting a new invitation.",
              },
              409,
            );
          }
          const { error: deleteExpiredInviteError } = await admin.auth.admin.deleteUser(
            invitedUser.id,
          );
          if (deleteExpiredInviteError) throw deleteExpiredInviteError;
          invitedUser = null;
          renewedUnusedInvitation = true;
        }

        // Team members removed while their original invitation was still unused
        // leave behind an Auth record. Reset only those unclaimed invitations so
        // the same email can receive a fresh account-creation email on re-invite.
        if (!pendingMembership) {
          const { data: userLookup, error: userLookupError } = await admin.auth.admin.getUserById(
            invitedUser.id,
          );
          if (userLookupError) throw userLookupError;
          const existingUser = userLookup.user;
          const unusedInvitation =
            Boolean(existingUser?.invited_at) &&
            !existingUser?.email_confirmed_at &&
            !existingUser?.last_sign_in_at;

          if (unusedInvitation) {
            const { error: deleteUnusedInviteError } = await admin.auth.admin.deleteUser(
              invitedUser.id,
            );
            if (deleteUnusedInviteError) throw deleteUnusedInviteError;
            invitedUser = null;
            renewedUnusedInvitation = true;
          }
        }
      }

      let invited = false;
      if (!invitedUser) {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
          // The invitation authenticates the new user, then this route lets
          // them choose their first password before entering the team workspace.
          redirectTo: teamInvitationRedirect,
          data: { role: "company", full_name: email.split("@")[0], company_team_invite: companyId },
        });
        if (error || !data.user) throw error || new Error("Team invitation could not be created");
        invitedUser = data.user;
        invited = true;
      }

      const { data: invitedProfile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", invitedUser.id)
        .maybeSingle();
      if (!invited && invitedProfile?.role !== "company") {
        return json(
          {
            error:
              "This email uses an officer account. Invite a separate company staff email so the officer profile remains protected.",
          },
          409,
        );
      }

      const { data: otherMembership } = await admin
        .from("company_members")
        .select("company_id")
        .eq("user_id", invitedUser.id)
        .neq("company_id", companyId)
        .maybeSingle();
      if (otherMembership)
        return json({ error: "This account already belongs to another company team" }, 409);
      if (invitedUser.id === company.user_id)
        return json({ error: "The company owner is already on this team" }, 409);

      const { error: roleError } = await admin
        .from("user_roles")
        .upsert({ user_id: invitedUser.id, role: "company" }, { onConflict: "user_id,role" });
      if (roleError) throw roleError;
      const { error: memberError } = await admin.from("company_members").upsert(
        {
          company_id: companyId,
          user_id: invitedUser.id,
          email,
          role,
          status: invited ? "invited" : "active",
          invited_by: authData.user.id,
          invited_at: new Date().toISOString(),
          joined_at: invited ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,user_id" },
      );
      if (memberError) throw memberError;
      return json({
        success: true,
        invited,
        message: invited
          ? renewedUnusedInvitation
            ? `A fresh invitation was sent to ${email}`
            : `Invitation sent to ${email}`
          : `${email} was added to the team`,
      });
    }

    const memberId = clean(body.member_id);
    if (!memberId) return json({ error: "Team member is required" }, 400);
    const { data: target } = await admin
      .from("company_members")
      .select("id,user_id,email,role,status")
      .eq("id", memberId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!target) return json({ error: "Team member not found" }, 404);
    if (target.role === "owner" || target.user_id === company.user_id)
      return json({ error: "The company owner cannot be changed or removed" }, 409);
    if (target.user_id === authData.user.id)
      return json({ error: "You cannot remove or change your own administrator access" }, 409);

    if (action === "update_role") {
      const role = clean(body.role);
      if (!roles.has(role)) return json({ error: "Choose a valid team role" }, 400);
      const { error } = await admin
        .from("company_members")
        .update({ role, updated_at: new Date().toISOString() })
        .eq("id", memberId);
      if (error) throw error;
      return json({ success: true });
    }
    if (action === "remove") {
      if (body.confirm_delete !== true) {
        return json({ error: "Confirm removal before deleting this team member" }, 400);
      }

      // The Team trash flow is a full account deletion for non-owners. Auth
      // deletion cascades their team membership and frees the email address so
      // it can only return through a fresh invite and account-creation flow.
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(target.user_id);
      if (deleteUserError) throw deleteUserError;
      return json({
        success: true,
        deleted_account: true,
        message: `${target.email} was deleted and can be invited again`,
      });
    }
    return json({ error: "Unknown team action" }, 400);
  } catch (error) {
    console.error("Company team operation failed", error);
    return json(
      { error: error instanceof Error ? error.message : "Company team operation failed" },
      500,
    );
  }
});
