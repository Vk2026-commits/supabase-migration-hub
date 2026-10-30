import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import OfficerDashboard from "@/components/dashboard/OfficerDashboard";
import CompanyDashboard from "@/components/dashboard/CompanyDashboard";
import ExpiredTrialDialog from "@/components/dashboard/ExpiredTrialDialog";
import { loadAccountAccess, type AccountAccess } from "@/lib/account-access";
import { availablePortals, resolvePortal, type PortalRole } from "@/lib/account-routing";
import { authDeadline, requestWithDeadline } from "@/lib/authRequest";
import { Link } from "@/lib/router-compat";
import {
  loadCompanyWorkspaces,
  selectCompanyWorkspace,
  type CompanyWorkspace,
} from "@/lib/company-workspaces";

type AccountProfile = {
  role?: string | null;
  full_name?: string | null;
};

type CompanyProfile = {
  trial_end_date?: string | null;
  subscription_tier?: string | null;
  company_name?: string | null;
  company_phone?: string | null;
  [key: string]: unknown;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewAs = searchParams.get("viewAs");
  const onboarding = searchParams.get("onboarding");
  const requestedCompanyId = searchParams.get("companyId");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExpiredTrialDialog, setShowExpiredTrialDialog] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [companyWorkspaces, setCompanyWorkspaces] = useState<CompanyWorkspace[]>([]);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [portals, setPortals] = useState<PortalRole[]>([]);
  const [accountAccess, setAccountAccess] = useState<AccountAccess | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAccessError(null);
    setShowExpiredTrialDialog(false);
    setCompanyProfile(null);
    setCompanyWorkspaces([]);
    setPortals([]);
    setAccountAccess(null);
    const timer = window.setTimeout(() => {
      active = false;
      setAccessError("The account service is taking too long to respond. Retry to load your account; this does not erase your application.");
      setLoading(false);
    }, 25000);
    const getProfile = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await authDeadline(supabase.auth.getSession());
        if (!active) return;
        if (sessionError) throw sessionError;

        if (!session) {
          const next = `${window.location.pathname}${window.location.search}`;
          navigate(`/auth?next=${encodeURIComponent(next)}`);
          return;
        }

        setUser(session.user);

        const access = await loadAccountAccess(session.user.id);
        if (!active) return;
        setAccountAccess(access);
        setPortals(availablePortals(access));
        const profileData = access.profile;

        // Legacy invitation emails authenticated the recipient and sent them
        // straight to the dashboard. A pending membership must create a
        // password before gaining workspace access, so route it to the
        // branded account-activation screen instead.
        // An established member with an active workspace must not be diverted
        // into account setup just because another team has a pending invitation.
        if (access.companyCount === 0 && viewAs !== "officer" &&
            (viewAs === "company" || access.profileRole === "company" || access.roles.includes("company"))) {
          const { data: pendingMembership, error: membershipError } = await requestWithDeadline((signal) => supabase
            .from("company_members")
            .select("id,status,password_created_at")
            .eq("user_id", session.user.id)
            .in("status", ["invited", "accepted"])
            .order("invited_at", { ascending: false })
            .limit(1)
            .abortSignal(signal).maybeSingle());
          if (!active) return;

          if (membershipError) throw membershipError;
          if (pendingMembership) {
            navigate(
              pendingMembership.status === "accepted" && pendingMembership.password_created_at
                ? "/complete-team-profile"
                : "/reset-password?invite=company-team",
              { replace: true },
            );
            return;
          }
        }

        const effectiveRole = resolvePortal(access, viewAs, requestedCompanyId);
        if (effectiveRole === "admin") {
          navigate("/admin", { replace: true });
          return;
        }

        // Check if this is a company with expired trial.
        if (effectiveRole === "company") {
            const workspaces = access.workspaces;
            const selectedWorkspace = selectCompanyWorkspace(workspaces, requestedCompanyId);
            const companyData = selectedWorkspace?.company || null;
            if (!companyData) throw new Error("No authorized company workspace was found");
            setCompanyWorkspaces(workspaces);
            setCompanyProfile(companyData);

            const trialExpired =
              companyData.trial_end_date && new Date(companyData.trial_end_date) < new Date();
            const isFreeTier = companyData.subscription_tier === "free";

            setShowExpiredTrialDialog(Boolean(trialExpired && isFreeTier));
        }
        setAccessError(null);
        setProfile({ ...profileData, role: effectiveRole });
      } catch (error) {
        console.error("Failed to load dashboard:", error);
        // A failed verification is not evidence of officer access. Preserve the
        // destination and show a retry instead of silently changing portals.
        if (active) setAccessError(error instanceof Error ? error.message : "Your account could not be loaded. Please retry. Your account type has not been changed.");
      } finally {
        if (active) {
          clearTimeout(timer);
          setLoading(false);
        }
      }
    };

    getProfile();
    return () => { active = false; clearTimeout(timer); };
  }, [navigate, requestedCompanyId, viewAs, retry]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar verifiedAccess={accountAccess} />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-12 w-64 mb-8" />
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!user && !accessError) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar verifiedAccess={accountAccess} />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-12 w-64 mb-8" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!user || accessError || (profile?.role !== "officer" && profile?.role !== "company")) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar verifiedAccess={accountAccess} />
        <main className="container mx-auto px-4 py-10">
          <Card className="mx-auto max-w-xl">
            <CardHeader>
              <CardTitle>Account access could not be verified</CardTitle>
              <CardDescription>{accessError || "Refresh the page to verify your account access."}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground" onClick={() => setRetry(value => value + 1)}>
                Retry loading account
              </button>
              {portals.includes("company") && <Link to="/dashboard?viewAs=company" className="rounded-md border px-4 py-2">Open company workspace</Link>}
              {portals.includes("officer") && <Link to="/dashboard?viewAs=officer" className="rounded-md border px-4 py-2">Open officer workspace</Link>}
              <Link to="/auth?role=company&force=1" className="rounded-md border px-4 py-2">Company sign-in</Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const handleUpgradeComplete = async () => {
    setShowExpiredTrialDialog(false);
    const workspaces = await loadCompanyWorkspaces(user.id);
    const companyData = selectCompanyWorkspace(workspaces, requestedCompanyId)?.company || null;

    if (companyData) {
      setCompanyWorkspaces(workspaces);
      setCompanyProfile(companyData);
    }
  };

  const handleSwitchCompanyWorkspace = (companyId: string) => {
    setShowExpiredTrialDialog(false);
    navigate(`/dashboard?viewAs=company&companyId=${encodeURIComponent(companyId)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar verifiedAccess={accountAccess} />
      <div className="container mx-auto px-4 py-8">
        {profile.role === "officer" ? (
          <OfficerDashboard
            userId={user.id}
            initialTab={onboarding === "application" ? "hiring-application" : "overview"}
          />
        ) : (
          <>
            {showExpiredTrialDialog && companyProfile && (
              <ExpiredTrialDialog
                open={showExpiredTrialDialog}
                companyId={String(companyProfile.id)}
                companyName={companyProfile.company_name || "your company"}
                companyPhone={companyProfile.company_phone || "N/A"}
                email={user?.email || "N/A"}
                otherWorkspaces={companyWorkspaces
                  .filter((workspace) => workspace.company.id !== companyProfile.id)
                  .map((workspace) => ({
                    id: workspace.company.id,
                    name: workspace.company.company_name,
                    role: workspace.role,
                  }))}
                onSwitchWorkspace={handleSwitchCompanyWorkspace}
                onUpgrade={handleUpgradeComplete}
              />
            )}
            <div className="-mx-4 -my-8">
              <CompanyDashboard
                userId={user.id}
                userName={profile?.full_name || user?.email || ""}
                verifiedWorkspaces={companyWorkspaces}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
