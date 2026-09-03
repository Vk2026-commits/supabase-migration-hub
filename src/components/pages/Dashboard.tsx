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

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewAs = searchParams.get("viewAs");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showExpiredTrialDialog, setShowExpiredTrialDialog] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  useEffect(() => {
    const getProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth");
        return;
      }

      setUser(session.user);

      // Check if user is admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      const isAdmin = !!roles;
      const previewRole = isAdmin && (viewAs === "officer" || viewAs === "company") ? viewAs : null;

      if (isAdmin && !previewRole) {
        navigate("/admin");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      setProfile(previewRole ? { ...profileData, role: previewRole } : profileData);

      // Check if this is a company with expired trial
      if (!previewRole && profileData?.role === "company") {
        const { data: companyData } = await supabase
          .from("company_profiles")
          .select("*")
          .eq("user_id", session.user.id)
          .single();

        if (companyData) {
          setCompanyProfile(companyData);
          
          // Check if trial has expired and they're still on free tier
          const trialExpired = companyData.trial_end_date && new Date(companyData.trial_end_date) < new Date();
          const isFreeTier = companyData.subscription_tier === 'free';
          
          if (trialExpired && isFreeTier) {
            setShowExpiredTrialDialog(true);
          }
        }
      }

      setLoading(false);
    };

    getProfile();
  }, [navigate, viewAs]);


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
    // Reload the profile data
    const { data: companyData } = await supabase
      .from("company_profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    
    if (companyData) {
      setCompanyProfile(companyData);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        {profile?.role === "officer" ? (
          <OfficerDashboard userId={user.id} />
        ) : (
          <>
            {showExpiredTrialDialog && companyProfile && (
              <ExpiredTrialDialog
                open={showExpiredTrialDialog}
                companyName={companyProfile.company_name || "your company"}
                companyPhone={companyProfile.company_phone || "N/A"}
                email={user?.email || "N/A"}
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
