import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Lock, User, MessageCircle, ClipboardCheck, Mail, Phone, FileCheck2, LayoutGrid, List, Loader2, UserCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ChatDialog } from "./ChatDialog";
import { ApplicantReviewDialog } from "./ApplicantReviewDialog";
import HireButton from "./HireButton";
import { InterviewScheduler } from "./InterviewScheduler";
import { OnboardingDocumentsDialog } from "./OnboardingDocumentsDialog";
import { PreEmploymentScreeningDialog } from "./PreEmploymentScreeningDialog";

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

const getNextStep = (app: any, onboarding: ReturnType<typeof getOnboardingStatus>) => {
  if (app.status === "accepted") {
    if (app.employmentConfirmedAt) return { label: "Employment confirmed — view in Hired", tone: "border-green-300 bg-green-50 text-green-800" };
    if (onboarding.percent === 100 && app.screeningReady) return { label: "Next: Accept as hired", tone: "border-green-300 bg-green-50 text-green-800" };
    if (onboarding.percent === 100) return { label: "Next: Complete required screening", tone: "border-amber-300 bg-amber-50 text-amber-800" };
    if (onboarding.percent === 0) return { label: "Next: Officer starts onboarding", tone: "border-blue-300 bg-blue-50 text-blue-800" };
    return { label: `Officer completing: ${onboarding.detail}`, tone: "border-blue-300 bg-blue-50 text-blue-800" };
  }

  if (app.interview?.status === "scheduled") {
    if (app.interview.response_status === "accepted") return { label: "Next: Complete interview", tone: "border-violet-300 bg-violet-50 text-violet-800" };
    if (app.interview.response_status === "declined") return { label: "Next: Follow up or reschedule interview", tone: "border-amber-300 bg-amber-50 text-amber-800" };
    return { label: "Waiting for interview response", tone: "border-blue-300 bg-blue-50 text-blue-800" };
  }

  const steps: Record<string, { label: string; tone: string }> = {
    interested: { label: "Next: Review application", tone: "border-amber-300 bg-amber-50 text-amber-800" },
    submitted: { label: "Next: Review application", tone: "border-amber-300 bg-amber-50 text-amber-800" },
    reviewed: { label: "Next: Schedule interview", tone: "border-blue-300 bg-blue-50 text-blue-800" },
    interview_scheduled: { label: "Next: Complete interview", tone: "border-violet-300 bg-violet-50 text-violet-800" },
    interview_completed: { label: "Next: Send offer", tone: "border-blue-300 bg-blue-50 text-blue-800" },
    offer_sent: { label: "Waiting for offer response", tone: "border-amber-300 bg-amber-50 text-amber-800" },
    offer_expired: { label: "Next: Resend or revise offer", tone: "border-red-300 bg-red-50 text-red-800" },
    declined: { label: "Offer declined", tone: "border-slate-300 bg-slate-50 text-slate-700" },
  };
  return steps[String(app.status || "")] || { label: "Next: Review application", tone: "border-amber-300 bg-amber-50 text-amber-800" };
};

const JobApplicants = ({ companyId, subscriptionTier, onNavigateToSubscriptions }: JobApplicantsProps) => {
  const [applications, setApplications] = useState<any[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [reviewApplication, setReviewApplication] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onboardingApplication, setOnboardingApplication] = useState<any>(null);
  const [hireToConfirm, setHireToConfirm] = useState<any>(null);
  const [screeningApplication, setScreeningApplication] = useState<any>(null);
  const [confirmingHire, setConfirmingHire] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "compact">("cards");

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
    const [profilesResult, offersResult, hiresResult, progressResult, screeningResult, interviewsResult, unreadResult] = await Promise.all([
      officerUserIds.length ? supabase.from("profiles").select("id, full_name, email").in("id", officerUserIds) : Promise.resolve({ data: [], error: null }),
      (supabase as any).from("employment_offers").select("hire_id,job_application_id").eq("company_id", companyId).in("status", ["accepted", "legacy_accepted"]),
      (supabase as any).from("hires").select("id,employment_confirmed_at").eq("company_id", companyId).eq("status", "active"),
      (supabase as any).rpc("get_company_onboarding_progress", { _company_id: companyId }),
      (supabase as any).from("hire_screening_checks").select("*").eq("company_id", companyId).order("created_at"),
      (supabase as any).from("interview_schedules").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("sender_type", "officer").eq("is_read", false),
    ]);
    if (offersResult.error) console.error("Failed to match accepted offers", offersResult.error);
    if (hiresResult.error) console.error("Failed to load hire confirmation state", hiresResult.error);
    if (progressResult.error) console.error("Failed to load onboarding progress", progressResult.error);
    if (screeningResult.error) console.error("Failed to load screening checks", screeningResult.error);
    if (interviewsResult.error) console.error("Failed to load interviews", interviewsResult.error);
    if (!unreadResult.error) setUnreadCount(unreadResult.count || 0);
    const progressByHire = new Map((progressResult.data || []).map((entry: any) => [entry.hire_id, entry]));
    const hireByApplication = new Map((offersResult.data || []).filter((offer: any) => offer.job_application_id && offer.hire_id).map((offer: any) => [offer.job_application_id, offer.hire_id]));
    const confirmationByHire = new Map((hiresResult.data || []).map((hire: any) => [hire.id, hire.employment_confirmed_at]));
    const screeningByHire = new Map<string, any[]>();
    for (const check of screeningResult.data || []) screeningByHire.set(check.hire_id, [...(screeningByHire.get(check.hire_id) || []), check]);
    const interviewByApplication = new Map<string, any>();
    for (const interview of interviewsResult.data || []) if (!interviewByApplication.has(interview.job_application_id)) interviewByApplication.set(interview.job_application_id, interview);
    const applicationRows = (data || []).map((app: any) => {
      const hiringApplications = [...(app.hiring_application || [])].sort((left: any, right: any) => new Date(right.submitted_at || right.created_at || 0).getTime() - new Date(left.submitted_at || left.created_at || 0).getTime());
      const profile = profilesResult.data?.find((entry: any) => entry.id === app.officer?.user_id);
      const applicationSnapshot = hiringApplications[0]?.application_data || {};
      const hireId = hireByApplication.get(app.id);
      const screeningChecks = screeningByHire.get(hireId) || [];
      return {
        ...app,
        hiring_application: hiringApplications,
        officerName: profile?.full_name || applicationSnapshot.applicantName || "Unknown",
        officerEmail: applicationSnapshot.email || profile?.email || "",
        officerPhone: applicationSnapshot.phone || app.officer?.phone || "",
        hireId,
        employmentConfirmedAt: confirmationByHire.get(hireId) || null,
        onboardingProgress: progressByHire.get(hireId) || null,
        screeningChecks,
        screeningReady: screeningChecks.length > 0 && screeningChecks.filter((check: any) => check.required).every((check: any) => check.status === "cleared"),
        interview: interviewByApplication.get(app.id) || null,
      };
    });
    setApplications(applicationRows.filter((app: any) => !app.employmentConfirmedAt));
  };

  const confirmHire = async () => {
    if (!hireToConfirm?.hireId) return;
    setConfirmingHire(true);
    try {
      const { error } = await (supabase as any).rpc("confirm_officer_hire", { _hire_id: hireToConfirm.hireId });
      if (error) throw error;
      toast.success(`${hireToConfirm.officerName} was moved to Hired`);
      setHireToConfirm(null);
      await loadApplications();
    } catch (error: any) {
      console.error("Failed to confirm hire", error);
      toast.error(error?.message || "The hire could not be confirmed");
    } finally {
      setConfirmingHire(false);
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
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center gap-3"><CardTitle>Applicants</CardTitle>{applications.length > 0 && <Badge variant="secondary" className="rounded-full">{applications.length} total</Badge>}{unreadCount > 0 && <Badge className="rounded-full">{unreadCount} new message{unreadCount === 1 ? "" : "s"}</Badge>}</div>
        <CardDescription>
          Officers who have expressed interest in your positions
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
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

        {applications.length > 0 && <div className="mb-4 flex justify-end"><div className="inline-flex rounded-lg border bg-muted/40 p-1" aria-label="Applicant layout"><Button type="button" size="sm" variant={viewMode === "cards" ? "default" : "ghost"} className="h-8" onClick={() => setViewMode("cards")}><LayoutGrid className="mr-2 h-4 w-4" />Cards</Button><Button type="button" size="sm" variant={viewMode === "compact" ? "default" : "ghost"} className="h-8" onClick={() => setViewMode("compact")}><List className="mr-2 h-4 w-4" />Compact</Button></div></div>}
        <div className={viewMode === "cards" ? "grid gap-3 md:grid-cols-2 2xl:grid-cols-3" : "space-y-2"}>
          {applications.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No applications yet. Post jobs to attract security officers.
            </p>
          ) : (
            applications.map((app) => {
              const onboarding = getOnboardingStatus(app.onboardingProgress);
              const nextStep = getNextStep(app, onboarding);
              return (
              <div key={app.id} className={`group rounded-xl border bg-card transition-all duration-200 hover:-translate-y-px hover:shadow-md ${viewMode === "cards" ? `p-4 ${onboarding.percent === 100 ? "border-t-2 border-t-green-500" : app.status === "accepted" ? "border-t-2 border-t-blue-500" : "border-t-2 border-t-slate-300"}` : "border-border/70 p-4 shadow-sm xl:grid xl:grid-cols-[minmax(250px,1.05fr)_minmax(270px,1fr)_minmax(350px,auto)] xl:items-center xl:gap-5"}`}>
                <div className={viewMode === "cards" ? "mb-3" : "mb-3 min-w-0 xl:mb-0"}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-xs font-bold text-primary ring-1 ring-primary/10">{app.officerName.split(/\s+/).map((part: string) => part[0]).join("").slice(0, 2).toUpperCase() || <User className="h-4 w-4" />}</span>
                      <div className="min-w-0">
                        <span className="block truncate font-semibold leading-tight text-foreground">{isPaidSubscriber ? app.officerName : getMaskedName(app.officerName)}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{app.job_posting?.title || "Security Officer"}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pl-12 pt-1">
                      {isPaidSubscriber && app.officerPhone && (
                        <a href={`tel:${app.officerPhone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                          <Phone className="h-3 w-3" />
                          {app.officerPhone}
                        </a>
                      )}
                      {isPaidSubscriber && app.officerEmail && (
                        <a href={`mailto:${app.officerEmail}`} className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                          <Mail className="h-3 w-3 shrink-0" />
                          {app.officerEmail}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className={viewMode === "cards" ? "space-y-2" : "mb-3 min-w-0 space-y-2 xl:mb-0"}>
                  <div className={`rounded-lg border px-3 py-2.5 ${nextStep.tone}`}>
                    <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      What happens next
                    </div>
                    <p className="text-sm font-semibold leading-snug">{nextStep.label.replace(/^Next:\s*/, "")}</p>
                  </div>

                  {app.status === "accepted" && <div className={`rounded-lg border px-3 py-2.5 ${onboarding.percent === 100 ? "border-green-200 bg-green-50/60" : "border-blue-200 bg-blue-50/50"}`}>
                    <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><ClipboardCheck className={`h-4 w-4 shrink-0 ${onboarding.percent === 100 ? "text-green-700" : "text-primary"}`} /><div className="min-w-0"><strong className="block truncate text-xs">{onboarding.label}</strong><span className="block truncate text-[11px] text-muted-foreground">{onboarding.detail}</span></div></div><span className="shrink-0 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-bold shadow-sm">{onboarding.percent}%</span></div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-background"><div className={`h-full rounded-full transition-all ${onboarding.percent === 100 ? "bg-green-600" : "bg-primary"}`} style={{ width: `${onboarding.percent}%` }} /></div>
                  </div>}
                </div>

                {isPaidSubscriber ? (
                  <div className={viewMode === "cards" ? "mt-3 grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2 xl:w-[350px]"}>
                    <Button 
                      size="sm"
                      className="h-9 px-3 text-xs shadow-sm"
                      onClick={() => setReviewApplication(app)}
                    >
                      Review Application
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-9 px-3 text-xs"
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
                      <MessageCircle className="mr-1.5 h-3 w-3" />
                      Chat
                    </Button>
                    <InterviewScheduler
                      companyId={companyId}
                      companyName={companyProfile?.company_name || "The company"}
                      officerId={app.officer.id}
                      officerName={app.officerName}
                      jobApplicationId={app.id}
                      jobTitle={app.job_posting?.title || "Security Officer"}
                      applicationStatus={app.status}
                      existingInterview={app.interview}
                      onChanged={loadApplications}
                    />
                    {app.status === "accepted" && app.onboardingProgress?.packet_id && (
                      <Button size="sm" variant="outline" className="h-9 px-3 text-xs" onClick={() => setOnboardingApplication(app)}>
                        <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
                        View onboarding
                      </Button>
                    )}
                    {app.status === "accepted" && onboarding.percent === 100 && app.hireId && (
                      <Button size="sm" variant="outline" className="h-9 px-3 text-xs" onClick={() => setScreeningApplication(app)}>
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Review screening
                      </Button>
                    )}
                    {app.status === "accepted" && onboarding.percent === 100 && !app.employmentConfirmedAt && app.hireId && (
                      <Button size="sm" disabled={!app.screeningReady} title={!app.screeningReady ? "Clear every required screening check first" : undefined} className="h-9 bg-green-600 px-3 text-xs text-white shadow-sm hover:bg-green-700" onClick={() => setHireToConfirm(app)}>
                        <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                        Accept as hired
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
      <OnboardingDocumentsDialog open={Boolean(onboardingApplication)} onOpenChange={(open) => !open && setOnboardingApplication(null)} application={onboardingApplication} />
      <PreEmploymentScreeningDialog open={Boolean(screeningApplication)} onOpenChange={(open) => !open && setScreeningApplication(null)} application={screeningApplication} onChanged={loadApplications} />
      <AlertDialog open={Boolean(hireToConfirm)} onOpenChange={(open) => !open && !confirmingHire && setHireToConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept {hireToConfirm?.officerName} as hired?</AlertDialogTitle>
            <AlertDialogDescription>
              All required screening checks are recorded as cleared. Confirm that you have reviewed the results and want to move this officer into the Hired section.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmingHire}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={confirmingHire} onClick={(event) => { event.preventDefault(); void confirmHire(); }} className="bg-green-600 text-white hover:bg-green-700">
              {confirmingHire ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming…</> : "Confirm and move to Hired"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default JobApplicants;
