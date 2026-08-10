import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock, User, MessageCircle } from "lucide-react";
import { ChatDialog } from "./ChatDialog";

interface JobApplicantsProps {
  companyId: string;
  subscriptionTier: string;
  onNavigateToSubscriptions?: () => void;
}

const JobApplicants = ({ companyId, subscriptionTier, onNavigateToSubscriptions }: JobApplicantsProps) => {
  const navigate = useNavigate();
  const [applications, setApplications] = useState<any[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  useEffect(() => {
    loadApplications();
    loadCompanyProfile();
  }, [companyId]);

  const loadCompanyProfile = async () => {
    const { data } = await supabase
      .from("company_profiles")
      .select("company_name")
      .eq("id", companyId)
      .single();
    setCompanyProfile(data);
  };

  const loadApplications = async () => {
    const { data, error } = await supabase
      .from("job_applications")
      .select(`
        *,
        job_posting:job_postings(title),
        officer:officer_profiles(id, user_id),
        profile:officer_profiles(user_id)
      `)
      .eq("job_posting.company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load applications:", error);
      return;
    }

    // Get profile data for all officers
    const officerUserIds = data?.map((app: any) => app.officer?.user_id).filter(Boolean) || [];
    
    if (officerUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", officerUserIds);

      const applicationsWithNames = data?.map((app: any) => ({
        ...app,
        officerName: profiles?.find((p) => p.id === app.officer?.user_id)?.full_name || "Unknown",
      }));

      setApplications(applicationsWithNames || []);
    } else {
      setApplications(data || []);
    }
  };

  const getMaskedName = (fullName: string) => {
    const parts = fullName.split(" ");
    if (parts.length === 0) return "Unknown";
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1]?.[0] || "";
    return `${firstName} ${lastInitial}.`;
  };

  const isPaidSubscriber = subscriptionTier === "professional" || subscriptionTier === "premium";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Applicants</CardTitle>
        <CardDescription>
          Officers who have expressed interest in your positions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isPaidSubscriber && (
          <div className="mb-4 p-4 bg-muted rounded-lg">
            <div className="flex items-start gap-3 mb-3">
              <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium mb-1">Upgrade to view full details</p>
                <p className="text-sm text-muted-foreground">
                  Subscribe to Professional or Premium to view full officer profiles and contact them directly.
                </p>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="default" 
              onClick={onNavigateToSubscriptions}
            >
              View Subscription Plans
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {applications.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No applications yet. Post jobs to attract security officers.
            </p>
          ) : (
            applications.map((app) => (
              <div key={app.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        {isPaidSubscriber ? app.officerName : getMaskedName(app.officerName)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Applied to: {app.job_posting?.title}
                    </p>
                  </div>
                  <Badge variant="secondary">{app.status}</Badge>
                </div>

                {isPaidSubscriber ? (
                  <div className="flex gap-2 mt-3">
                    <Button 
                      size="sm"
                      onClick={() => {
                        // Navigate to browse page to view the officer's profile
                        navigate(`/browse?officer=${app.officer.id}`);
                      }}
                    >
                      View Profile
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setSelectedOfficer({
                          id: app.officer.id,
                          name: app.officerName
                        });
                        setChatOpen(true);
                      }}
                    >
                      <MessageCircle className="h-3 w-3 mr-2" />
                      Chat
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" disabled className="mt-3">
                    <Lock className="h-3 w-3 mr-2" />
                    Unlock with Subscription
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
      {chatOpen && selectedOfficer && companyProfile && (
        <ChatDialog
          open={chatOpen}
          onOpenChange={setChatOpen}
          companyId={companyId}
          companyName={companyProfile.company_name}
          officerId={selectedOfficer.id}
          officerName={selectedOfficer.name}
          currentUserType="company"
        />
      )}
    </Card>
  );
};

export default JobApplicants;