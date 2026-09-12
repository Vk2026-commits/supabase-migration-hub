import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Lock, User, MessageCircle, ClipboardCheck, Mail, Phone } from "lucide-react";
import { ChatDialog } from "./ChatDialog";
import { generateGuardApplicationPDF, type GuardApplicationData } from "@/lib/generateGuardApplicationPDF";
import { ApplicantReviewDialog } from "./ApplicantReviewDialog";
import HireButton from "./HireButton";
import { InterviewScheduler } from "./InterviewScheduler";

interface JobApplicantsProps {
  companyId: string;
  subscriptionTier: string;
  onNavigateToSubscriptions?: () => void;
}

const onboardingSteps = ["Offer accepted", "Form I-9", "Form W-4", "Pay setup", "Emergency contact", "Company policies", "Uniform and schedule", "Review and sign"];

const getOnboardingStatus = (progress: any) => {
  if (!progress || progress.status === "not_started") return { label: "Onboarding not started", detail: "Offer accepted; waiting for the officer to begin.", percent: 0 };
  if (progress.status === "submitted") return { label: "Onboarding complete", detail: "The officer submitted the full onboarding packet.", percent: 100 };
  const step = Math.max(0, Math.min(7, Number(progress.current_step || 0)));
  return { label: `Onboarding: step ${step + 1} of 8`, detail: onboardingSteps[step], percent: Math.round(((step + 1) / 8) * 100) };
};

const JobApplicants = ({ companyId, subscriptionTier, onNavigateToSubscriptions }: JobApplicantsProps) => {
  const [applications, setApplications] = useState<any[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [reviewApplication, setReviewApplication] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    void loadApplications();
    void loadCompanyProfile();
    const refresh = window.setInterval(() => void loadApplications(), 15000);
    return () => window.clearInterval(refresh);
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
    const { data, error } = await (supabase as any)
      .from("job_applications")
      .select(`
        *,
        job_posting:job_postings(title),
        officer:officer_profiles(id, user_id, phone),
        profile:officer_profiles(user_id),
        hiring_application:guard_hiring_applications(id,application_data,status,submitted_at,created_at,evidence_snapshot_status,evidence_snapshot_kind,evidence_snapshot_completed_at)
      `)
      .eq("job_posting.company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load applications:", error);
      return;
    }

    // Get display names and non-sensitive onboarding progress for accepted offers.
    const officerUserIds = data?.map((app: any) => app.officer?.user_id).filter(Boolean) || [];
    const [profilesResult, offersResult, progressResult, unreadResult] = await Promise.all([
      officerUserIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", officerUserIds) : Promise.resolve({ data: [], error: null }),
      (supabase as any).from("employment_offers").select("hire_id,job_application_id").eq("company_id", companyId).in("status", ["accepted", "legacy_accepted"]),
      (supabase as any).rpc("get_company_onboarding_progress", { _company_id: companyId }),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("sender_type", "officer").eq("is_read", false),
    ]);
    if (offersResult.error) console.error("Failed to match accepted offers", offersResult.error);
    if (progressResult.error) console.error("Failed to load onboarding progress", progressResult.error);
    if (!unreadResult.error) setUnreadCount(unreadResult.count || 0);
    const progressByHire = new Map((progressResult.data || []).map((entry: any) => [entry.hire_id, entry]));
    const hireByApplication = new Map((offersResult.data || []).filter((offer: any) => offer.job_application_id && offer.hire_id).map((offer: any) => [offer.job_application_id, offer.hire_id]));
    setApplications((data || []).map((app: any) => {
      const hiringApplications = [...(app.hiring_application || [])].sort((left: any, right: any) => new Date(right.submitted_at || right.created_at || 0).getTime() - new Date(left.submitted_at || left.created_at || 0).getTime());
      const profile = profilesResult.data?.find((entry: any) => entry.id === app.officer?.user_id);
      const applicationSnapshot = hiringApplications[0]?.application_data || {};
      return {
        ...app,
        hiring_application: hiringApplications,
        officerName: profile?.full_name || applicationSnapshot.applicantName || "Unknown",
        officerEmail: applicationSnapshot.email || profile?.email || "",
        officerPhone: applicationSnapshot.phone || app.officer?.phone || "",
        onboardingProgress: progressByHire.get(hireByApplication.get(app.id)) || null,
      };
    }));
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
        <div className="flex flex-wrap items-center gap-3"><CardTitle>Applicants</CardTitle>{applications.length > 0 && <Badge variant="secondary" className="rounded-full">{applications.length} total</Badge>}{unreadCount > 0 && <Badge className="rounded-full">{unreadCount} new message{unreadCount === 1 ? "" : "s"}</Badge>}</div>
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
            applications.map((app) => {
              const onboarding = getOnboardingStatus(app.onboardingProgress);
              return (
              <div key={app.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">
                        {isPaidSubscriber ? app.officerName : getMaskedName(app.officerName)}
                      </span>
                      {isPaidSubscriber && app.officerPhone && (
                        <a href={`tel:${app.officerPhone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline">
                          <Phone className="h-3.5 w-3.5" />
                          {app.officerPhone}
                        </a>
                      )}
                      {isPaidSubscriber && app.officerEmail && (
                        <a href={`mailto:${app.officerEmail}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline">
                          <Mail className="h-3.5 w-3.5" />
                          {app.officerEmail}
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Applied to: {app.job_posting?.title}
                    </p>
                  </div>
                  <Badge variant="secondary">{app.status}</Badge>
                </div>

                {app.status === "accepted" && <div className={`mt-3 rounded-xl border p-3 ${onboarding.percent === 100 ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50/70"}`}>
                  <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-2"><ClipboardCheck className={`mt-0.5 h-4 w-4 shrink-0 ${onboarding.percent === 100 ? "text-green-700" : "text-primary"}`} /><div><strong className="block text-sm">{onboarding.label}</strong><span className="text-xs text-muted-foreground">{onboarding.detail}</span></div></div><Badge variant="outline" className="shrink-0 bg-background">{onboarding.percent}%</Badge></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background"><div className={`h-full rounded-full transition-all ${onboarding.percent === 100 ? "bg-green-600" : "bg-primary"}`} style={{ width: `${onboarding.percent}%` }} /></div>
                </div>}

                {isPaidSubscriber ? (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button 
                      size="sm"
                      onClick={() => setReviewApplication(app)}
                    >
                      Review Application
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setSelectedOfficer({
                          id: app.officer.id,
                          name: app.officerName,
                          jobApplicationId: app.id,
                          jobTitle: app.job_posting?.title,
                        });
                        setChatOpen(true);
                      }}
                    >
                      <MessageCircle className="h-3 w-3 mr-2" />
                      Chat
                    </Button>
                    {app.status !== "accepted" && <InterviewScheduler
                      companyId={companyId}
                      companyName={companyProfile?.company_name || "The company"}
                      officerId={app.officer.id}
                      officerName={app.officerName}
                      jobApplicationId={app.id}
                      jobTitle={app.job_posting?.title || "Security Officer"}
                      onChanged={loadApplications}
                    />}
                    {app.hiring_application?.[0]?.application_data && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generateGuardApplicationPDF(app.hiring_application[0].application_data as GuardApplicationData)}
                      >
                        <Download className="h-3 w-3 mr-2" />
                        Application PDF
                      </Button>
                    )}
                    {app.hiring_application?.[0]?.id && app.status !== "accepted" && (
                      <HireButton
                        officerId={app.officer.id}
                        officerName={app.officerName}
                        companyId={companyId}
                        hiringApplicationId={app.hiring_application[0].id}
                        jobApplicationId={app.id}
                        jobTitle={app.job_posting?.title}
                        onChanged={loadApplications}
                      />
                    )}
                    {app.status === "accepted" && <><Badge className="bg-green-600">Offer accepted</Badge><Badge variant="outline" className="border-green-300 bg-green-50 text-green-800">Onboarding packet sent</Badge></>}
                  </div>
                ) : (
                  <Button size="sm" variant="outline" disabled className="mt-3">
                    <Lock className="h-3 w-3 mr-2" />
                    Unlock with Subscription
                  </Button>
                )}
              </div>
            )})
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
          jobApplicationId={selectedOfficer.jobApplicationId}
          jobTitle={selectedOfficer.jobTitle}
        />
      )}
      <ApplicantReviewDialog open={Boolean(reviewApplication)} onOpenChange={(open) => !open && setReviewApplication(null)} application={reviewApplication} />
    </Card>
  );
};

export default JobApplicants;
