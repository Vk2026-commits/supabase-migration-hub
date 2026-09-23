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

  useEffect(() => {
    const getProfile = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          const next = `${window.location.pathname}${window.location.search}`;
          navigate(`/auth?next=${encodeURIComponent(next)}`);
          return;
        }

        setUser(session.user);

        // These requests are independent, so avoid paying for two network
        // round trips before the dashboard can render.
        const [{ data: roles, error: rolesError }, { data: profileData, error: profileError }] =
          await Promise.all([
            supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", session.user.id),
            supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
          ]);

        if (rolesError) throw rolesError;
        if (profileError) throw profileError;

        const accountRoles = new Set((roles || []).map(({ role }) => role));
        const isAdmin = accountRoles.has("admin");
        const requestedRole = viewAs === "officer" || viewAs === "company" ? viewAs : null;
        const selectedRole =
          requestedRole && (isAdmin || accountRoles.has(requestedRole)) ? requestedRole : null;

        if (isAdmin && !selectedRole) {
          navigate("/admin");
          return;
        }

        const effectiveRole = selectedRole || profileData?.role;

        // Legacy invitation emails authenticated the recipient and sent them
        // straight to the dashboard. A pending membership must create a
        // password before gaining workspace access, so route it to the
        // branded account-activation screen instead.
        if (!selectedRole && effectiveRole === "company") {
          const { data: pendingMembership, error: membershipError } = await supabase
            .from("company_members")
            .select("id,status,password_created_at")
            .eq("user_id", session.user.id)
            .in("status", ["invited", "accepted"])
            .order("invited_at", { ascending: false })
            .limit(1)
            .maybeSingle();

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

        setProfile(profileData ? { ...profileData, role: effectiveRole } : profileData);

        // Check if this is a company with expired trial.
        if (effectiveRole === "company") {
          const workspaces = await loadCompanyWorkspaces(session.user.id);
          const selectedWorkspace = selectCompanyWorkspace(workspaces, requestedCompanyId);
          const companyData = selectedWorkspace?.company || null;
          setCompanyWorkspaces(workspaces);
          if (companyData) {
            setCompanyProfile(companyData);

            const trialExpired =
              companyData.trial_end_date && new Date(companyData.trial_end_date) < new Date();
            const isFreeTier = companyData.subscription_tier === "free";

            setShowExpiredTrialDialog(Boolean(trialExpired && isFreeTier));
          }
        }
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    getProfile();
  }, [navigate, requestedCompanyId, viewAs]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
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

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-12 w-64 mb-8" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const handleUpgradeComplete = async () => {
    setShowExpiredTrialDialog(false);
    const workspaces = await loadCompanyWorkspaces(user.id);
    const companyData = selectCompanyWorkspace(workspaces, requestedCompanyId)?.company || null;

    if (companyData) {
      setCompanyProfile(companyData);
    }
  };

  const handleSwitchCompanyWorkspace = (companyId: string) => {
    setShowExpiredTrialDialog(false);
    navigate(`/dashboard?viewAs=company&companyId=${encodeURIComponent(companyId)}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        {profile?.role === "officer" ? (
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
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
