import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CompanyProfile = Database["public"]["Tables"]["company_profiles"]["Row"];

export type CompanyWorkspace = {
  company: CompanyProfile;
  role: string;
  owned: boolean;
};

export async function loadCompanyWorkspaces(userId: string): Promise<CompanyWorkspace[]> {
  const [ownedResult, membershipsResult] = await Promise.all([
    supabase.from("company_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("company_members")
      .select("company_id,role,status")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  if (ownedResult.error) throw ownedResult.error;
  if (membershipsResult.error) throw membershipsResult.error;

  const ownedCompany = ownedResult.data;
  const roleByCompanyId = new Map<string, string>();
  for (const membership of membershipsResult.data || []) {
    roleByCompanyId.set(membership.company_id, membership.role);
  }
  if (ownedCompany) roleByCompanyId.set(ownedCompany.id, "owner");

  const companyIds = Array.from(roleByCompanyId.keys());
  if (companyIds.length === 0) return [];

  const { data: companies, error } = await supabase
    .from("company_profiles")
    .select("*")
    .in("id", companyIds);
  if (error) throw error;

  return (companies || [])
    .map((company) => ({
      company,
      role: roleByCompanyId.get(company.id) || "reviewer",
      owned: company.id === ownedCompany?.id,
    }))
    .sort((left, right) => {
      if (left.owned !== right.owned) return left.owned ? -1 : 1;
      return left.company.company_name.localeCompare(right.company.company_name);
    });
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
