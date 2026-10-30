import { Link, useNavigate, useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Languages, Menu, Shield, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import { type CompanyWorkspace } from "@/lib/company-workspaces";
import { loadAccountAccess, type AccountAccess } from "@/lib/account-access";
import { availablePortals, resolvePortal } from "@/lib/account-routing";
import { authDeadline } from "@/lib/authRequest";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Navbar = ({ verifiedAccess }: { verifiedAccess?: AccountAccess | null }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [accountRoles, setAccountRoles] = useState<string[]>([]);
  const [companyWorkspaces, setCompanyWorkspaces] = useState<CompanyWorkspace[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accessFailed, setAccessFailed] = useState(false);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    // Auth callbacks only publish state. Data fetching happens in the effect
    // below, outside Supabase's session notification/refresh lifecycle.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedAuthEvent = true;
      if (active) setUser(session?.user ?? null);
    });
    authDeadline(supabase.auth.getSession()).then(({ data: { session } }) => {
      if (active && !receivedAuthEvent) setUser(session?.user ?? null);
    }).catch(() => { /* The sign-in/dashboard page owns recovery feedback. */ });

    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const userId = user?.id;
  useEffect(() => {
    let active = true;
    setIsAdmin(false);
    setUserRole(null);
    setAccountRoles([]);
    setCompanyWorkspaces([]);
    setAccessFailed(false);
    if (!userId) return;
    const request = verifiedAccess?.userId === userId ? Promise.resolve(verifiedAccess) : loadAccountAccess(userId);
    void request.then(access => {
      if (!active) return;
      setIsAdmin(access.roles.includes("admin"));
      setAccountRoles(availablePortals(access));
      setCompanyWorkspaces(access.workspaces);
      setUserRole(resolvePortal(access, null, null));
    }).catch(error => {
      if (!active) return;
      console.error("Failed to load account navigation", error);
      setAccessFailed(true);
    });
    return () => { active = false; };
  }, [userId, verifiedAccess]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const requestedRole = searchParams.get("viewAs");
  const selectedCompanyId = searchParams.get("companyId");
  const companyQuery = selectedCompanyId
    ? `&companyId=${encodeURIComponent(selectedCompanyId)}`
    : "";
  const browseHref = selectedCompanyId
    ? `/browse?companyId=${encodeURIComponent(selectedCompanyId)}`
    : "/browse";
  const activeRole =
    (requestedRole === "officer" || requestedRole === "company") &&
    accountRoles.includes(requestedRole)
      ? requestedRole
      : userRole;
  const hasOfficerAndCompanyAccess =
    accountRoles.includes("officer") && accountRoles.includes("company");
  const companyWorkspaceItems = companyWorkspaces.map((workspace) => (
    <DropdownMenuItem
      key={workspace.company.id}
      onClick={() => navigate(`/dashboard?viewAs=company&companyId=${encodeURIComponent(workspace.company.id)}`)}
    >
      {workspace.company.company_name}
      {workspace.owned || workspace.role === "owner" ? " (Owner)" : ""}
    </DropdownMenuItem>
  ));

  const navigationActions = (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Languages className="h-4 w-4" />
            <span className="text-sm">{i18n.language === "es" ? "Español" : "English"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => changeLanguage("en")}>English</DropdownMenuItem>
          <DropdownMenuItem onClick={() => changeLanguage("es")}>Español</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {user ? (
        <>
          {(activeRole === "company" || isAdmin) && (
            <Button variant="ghost" asChild>
              <Link to={browseHref}>{t("nav.browse")}</Link>
            </Button>
          )}
          <Button variant="ghost" asChild>
            <Link
              to={
                hasOfficerAndCompanyAccess &&
                (activeRole === "officer" || activeRole === "company")
                  ? `/dashboard?viewAs=${activeRole}${activeRole === "company" ? companyQuery : ""}`
                  : selectedCompanyId
                    ? `/dashboard?companyId=${encodeURIComponent(selectedCompanyId)}`
                    : "/dashboard"
              }
            >
              {t("nav.dashboard")}
            </Link>
          </Button>
          {accessFailed && <Button variant="ghost" asChild><Link to="/dashboard">Retry account access</Link></Button>}
          {isAdmin && (
            <>
              <Button variant="ghost" asChild>
                <Link to="/admin">Admin</Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">View as</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate("/dashboard?viewAs=officer")}>
                    Security Officer
                  </DropdownMenuItem>
                  {companyWorkspaceItems.length > 0 ? companyWorkspaceItems : (
                    <DropdownMenuItem onClick={() => navigate(`/dashboard?viewAs=company${companyQuery}`)}>
                      Company
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => navigate("/admin")}>Admin</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {hasOfficerAndCompanyAccess ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">Switch account</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate("/dashboard?viewAs=officer")}>
                  Security Officer
                </DropdownMenuItem>
                {companyWorkspaceItems.length > 0 ? companyWorkspaceItems : (
                  <DropdownMenuItem onClick={() => navigate(`/dashboard?viewAs=company${companyQuery}`)}>
                    Company Team
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : activeRole !== "officer" && (
            <Button variant="ghost" asChild>
              <Link to="/auth?force=1">Switch account</Link>
            </Button>
          )}
          <Button variant="outline" onClick={handleSignOut}>Sign Out</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" asChild>
            <Link to="/browse">{t("nav.browse")}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/auth">{t("nav.login")}</Link>
          </Button>
          <Button asChild>
            <Link to="/auth?mode=signup">{t("nav.signup")}</Link>
          </Button>
        </>
      )}
    </>
  );

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 lg:flex lg:justify-between lg:gap-4 lg:py-0">
        <Link to="/" className="flex min-w-0 items-center gap-2 whitespace-nowrap text-base font-semibold sm:text-xl">
          <Shield className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" />
          <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            We Find Guards
          </span>
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 gap-2 lg:hidden"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-actions"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          <span>{mobileMenuOpen ? "Close" : "Menu"}</span>
        </Button>

        <div className="hidden items-center gap-4 lg:flex">
          {navigationActions}
        </div>

        {mobileMenuOpen && (
          <div
            id="mobile-navigation-actions"
            className="col-span-2 flex max-h-[calc(100dvh-5rem)] min-w-0 flex-wrap items-center gap-2 overflow-y-auto border-t border-border py-3 lg:hidden [&>*]:max-w-full"
          >
            {navigationActions}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
