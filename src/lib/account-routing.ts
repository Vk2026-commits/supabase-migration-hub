export type PortalRole = "company" | "officer";

export function portalRole(value: string | null | undefined): PortalRole | null {
  return value === "company" || value === "officer" ? value : null;
}

// Navigation intent never proves a role or company membership.
export function safeReturnPath(value: string | null): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f]/.test(value)) return null;
  return value;
}

export function signInDestination(next: string | null, role: PortalRole | null): string {
  const path = safeReturnPath(next);
  if (path) {
    const url = new URL(path, "https://wefindguards.com");
    if (role && url.pathname === "/dashboard") {
      url.searchParams.set("viewAs", role);
      if (role === "officer") url.searchParams.delete("companyId");
      return `${url.pathname}${url.search}${url.hash}`;
    }
    return path;
  }
  return role ? `/dashboard?viewAs=${role}` : "/dashboard";
}

export type AccountAccessSummary = {
  profileRole: string | null;
  roles: string[];
  companyCount: number;
};

export function availablePortals(access: AccountAccessSummary): PortalRole[] {
  const portals: PortalRole[] = [];
  // A company role row alone does not confer workspace access.
  if (access.companyCount > 0) portals.push("company");
  if (access.profileRole === "officer" || access.roles.includes("officer") || access.roles.includes("admin")) {
    portals.push("officer");
  }
  return portals;
}

export function resolvePortal(access: AccountAccessSummary, requestedRole: string | null, companyId: string | null): PortalRole | "admin" {
  const portals = availablePortals(access);
  const requested = portalRole(requestedRole) || (companyId ? "company" : null);
  if (requested) {
    if (portals.includes(requested)) return requested;
    throw new Error(requested === "company"
      ? "No active company workspace was found for this account. Sign in with your company email or ask your company owner to check your team access."
      : "This account does not have a security officer profile. Open your company workspace or sign in with a different account.");
  }
  // Company team access is independent of the original signup role.
  if (portals.includes("company")) return "company";
  if (access.roles.includes("admin")) return "admin";
  if (portals.includes("officer")) return "officer";
  throw new Error("No active workspace was found for this account. Please retry or sign in with a different account.");
}
