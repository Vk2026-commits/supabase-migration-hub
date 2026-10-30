import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { requestWithDeadline } from "@/lib/authRequest";

export type CompanyProfile = Database["public"]["Tables"]["company_profiles"]["Row"];

export type CompanyWorkspace = {
  company: CompanyProfile;
  role: string;
  owned: boolean;
};

async function fetchCompanyWorkspaces(userId: string): Promise<CompanyWorkspace[]> {
  const [ownedResult, membershipsResult] = await Promise.all([
    requestWithDeadline((signal) => supabase.from("company_profiles").select("*").eq("user_id", userId).abortSignal(signal)),
    requestWithDeadline((signal) => supabase
      .from("company_members")
      .select("company_id,role,status")
      .eq("user_id", userId)
      .eq("status", "active").abortSignal(signal)),
  ]);

  if (ownedResult.error) throw ownedResult.error;
  if (membershipsResult.error) throw membershipsResult.error;

  const ownedCompanyIds = new Set((ownedResult.data || []).map((company) => company.id));
  const roleByCompanyId = new Map<string, string>();
  for (const membership of membershipsResult.data || []) {
    roleByCompanyId.set(membership.company_id, membership.role);
  }
  for (const companyId of ownedCompanyIds) roleByCompanyId.set(companyId, "owner");

  const memberCompanyIds = Array.from(roleByCompanyId.keys()).filter(id => !ownedCompanyIds.has(id));
  const companies = [...(ownedResult.data || [])];
  if (memberCompanyIds.length > 0) {
    const { data, error } = await requestWithDeadline((signal) => supabase
      .from("company_profiles").select("*").in("id", memberCompanyIds).abortSignal(signal));
    if (error) throw error;
    companies.push(...(data || []));
  }

  return (companies || [])
    .map((company) => ({
      company,
      role: roleByCompanyId.get(company.id) || "reviewer",
      owned: ownedCompanyIds.has(company.id),
    }))
    .sort((left, right) => {
      if (left.owned !== right.owned) return left.owned ? -1 : 1;
      return left.company.company_name.localeCompare(right.company.company_name);
    });
}

const pending = new Map<string, Promise<CompanyWorkspace[]>>();
export function loadCompanyWorkspaces(userId: string): Promise<CompanyWorkspace[]> {
  const existing = pending.get(userId);
  if (existing) return existing;
  const request = fetchCompanyWorkspaces(userId).finally(() => {
    if (pending.get(userId) === request) pending.delete(userId);
  });
  pending.set(userId, request);
  return request;
}

export function selectCompanyWorkspace(
  workspaces: CompanyWorkspace[],
  requestedCompanyId: string | null,
) {
  return (
    workspaces.find((workspace) => workspace.company.id === requestedCompanyId)
    || workspaces.find((workspace) => workspace.owned)
    || workspaces[0]
    || null
  );
}
