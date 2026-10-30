import { supabase } from "@/integrations/supabase/client";
import { loadCompanyWorkspaces } from "@/lib/company-workspaces";
import { requestWithDeadline } from "@/lib/authRequest";

async function fetchAccountAccess(userId: string) {
  const [profile, roles, workspaces] = await Promise.all([
    requestWithDeadline((signal) => supabase.from("profiles")
      .select("role,full_name").eq("id", userId).abortSignal(signal).maybeSingle()),
    requestWithDeadline((signal) => supabase.from("user_roles")
      .select("role").eq("user_id", userId).abortSignal(signal)),
    loadCompanyWorkspaces(userId),
  ]);
  if (profile.error) throw profile.error;
  if (roles.error) throw roles.error;
  return {
    userId,
    profile: profile.data,
    profileRole: profile.data?.role || null,
    roles: (roles.data || []).map(({ role }) => role),
    companyCount: workspaces.length,
    workspaces,
  };
}

export type AccountAccess = Awaited<ReturnType<typeof fetchAccountAccess>>;

// Share only in-flight requests. Permissions are not persisted or cached across
// visits, so a successful old lookup cannot conceal a removed membership.
const pending = new Map<string, Promise<AccountAccess>>();
export function loadAccountAccess(userId: string): Promise<AccountAccess> {
  const existing = pending.get(userId);
  if (existing) return existing;
  const request = fetchAccountAccess(userId).finally(() => {
    if (pending.get(userId) === request) pending.delete(userId);
  });
  pending.set(userId, request);
  return request;
}
