import { useDeferredValue, useEffect, useMemo, useState } from "react";
import "./ApplicantRoster.css";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, MessageCircle, Mail, Phone, FileCheck2, ShieldCheck, StickyNote, Search, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ChatDialog } from "./ChatDialog";
import { ApplicantReviewDialog } from "./ApplicantReviewDialog";
import HireButton from "./HireButton";
import { InterviewScheduler } from "./InterviewScheduler";
import { OnboardingDocumentsDialog } from "./OnboardingDocumentsDialog";
import { PreEmploymentScreeningDialog } from "./PreEmploymentScreeningDialog";
import { ApplicantNotesDialog } from "./ApplicantNotesDialog";
import { ProfileAvatar } from "./ProfileAvatar";
import { OfficerRecordShell } from "./OperationsWorkspace";

interface JobApplicantsProps {
  companyId: string;
  subscriptionTier: string;
  onNavigateToSubscriptions?: () => void;
  selectedOfficerId?: string | null;
  onOpenOfficer?: (officerId: string) => void;
  onCloseOfficer?: () => void;
}

const onboardingSteps = ["Offer accepted", "Form I-9", "Form W-4", "Pay setup", "Emergency contact", "Company policies", "Uniform and schedule", "Review and sign"];

const getOnboardingStatus = (progress: any) => {
  if (!progress || progress.status === "not_started") return { label: "Onboarding not started", detail: "Offer accepted; waiting for the officer to begin.", percent: 0 };
  if (progress.status === "submitted") return { label: "Onboarding complete", detail: "The officer submitted the full onboarding packet.", percent: 100 };
  const step = Math.max(0, Math.min(7, Number(progress.current_step || 0)));
  return { label: `Onboarding: step ${step + 1} of 8`, detail: onboardingSteps[step], percent: Math.round(((step + 1) / 8) * 100) };
};

const getNextStep = (app: any, onboarding: ReturnType<typeof getOnboardingStatus>) => {
  if (app.interview?.status === "cancelled" && app.interview?.cancelled_by === "officer" && !app.interview?.cancellation_company_dismissed_at) return { label: "Officer canceled interview — review reason", tone: "border-red-300 bg-red-50 text-red-800" };
  if (app.interview?.change_requested_by === "officer" && app.interview?.change_request_status === "pending") return { label: "Action required: Review officer reschedule request", tone: "border-violet-300 bg-violet-50 text-violet-800" };
  if (app.interview?.change_requested_by === "company" && app.interview?.change_request_status === "pending") return { label: "Waiting for officer to accept new interview time", tone: "border-blue-300 bg-blue-50 text-blue-800" };
  if (app.status === "accepted") {
    if (app.employmentConfirmedAt) return { label: "Employment confirmed — view in Hired", tone: "border-green-300 bg-green-50 text-green-800" };
    if (onboarding.percent === 100 && app.screeningReady) return { label: "Ready to finalize in Hired", tone: "border-green-300 bg-green-50 text-green-800" };
    if (onboarding.percent === 100) return { label: "Next: Complete required screening", tone: "border-amber-300 bg-amber-50 text-amber-800" };
    if (onboarding.percent === 0) return { label: "Next: Officer starts onboarding", tone: "border-blue-300 bg-blue-50 text-blue-800" };
    return { label: `Officer completing: ${onboarding.detail}`, tone: "border-blue-300 bg-blue-50 text-blue-800" };
  }

  if (app.interview?.attendance_status === "attended") return { label: "Interview attended — next: Send offer", tone: "border-green-300 bg-green-50 text-green-800" };
  if (app.interview?.attendance_status === "no_show") return { label: "Interview no-show — follow up or close application", tone: "border-red-300 bg-red-50 text-red-800" };

  if (app.interview?.status === "scheduled") {
    if (app.interview.response_status === "accepted" && new Date(app.interview.scheduled_at).getTime() <= Date.now()) return { label: "Action required: Confirm interview attendance", tone: "border-amber-300 bg-amber-50 text-amber-800" };
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

const getApplicantFilterStage = (app: any) => {
  if (app.status === "accepted") return app.onboardingProgress?.status === "submitted" ? "screening" : "onboarding";
  if (app.interview?.status === "scheduled") return "interview";
  if (["offer_sent", "offer_expired"].includes(String(app.status))) return "offer";
  return "review";
};

const JobApplicants = ({ companyId, subscriptionTier, onNavigateToSubscriptions, selectedOfficerId, onOpenOfficer, onCloseOfficer }: JobApplicantsProps) => {
  const [applications, setApplications] = useState<any[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [reviewApplication, setReviewApplication] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onboardingApplication, setOnboardingApplication] = useState<any>(null);
  const [screeningApplication, setScreeningApplication] = useState<any>(null);
  const [notesApplication, setNotesApplication] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  useEffect(() => {
    void loadApplications(true);
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

  const loadApplications = async (showLoading = false) => {
    if (showLoading) {
      setInitialLoading(true);
      setLoadError("");
    }

    try {
      const { data, error } = await (supabase as any)
        .from("job_applications")
        .select(`
          id,
          created_at,
          status,
          job_posting_id,
          officer_id,
          message,
          job_posting:job_postings(title),
          officer:officer_profiles(id, user_id, phone),
          hiring_application:guard_hiring_applications(id,status,submitted_at,created_at,evidence_snapshot_status,evidence_snapshot_kind,evidence_snapshot_completed_at)
        `)
        .eq("job_posting.company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Load the data needed to render applicant cards together. The unread-message
      // count is non-blocking because it should not delay the applicants themselves.
      const officerUserIds = data?.map((app: any) => app.officer?.user_id).filter(Boolean) || [];
      const unreadPromise = supabase.from("messages").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("sender_type", "officer").eq("is_read", false);
      const [profilesResult, offersResult, hiresResult, progressResult, screeningResult, interviewsResult, notesResult] = await Promise.all([
        officerUserIds.length ? supabase.from("profiles").select("id, full_name, email, avatar_url").in("id", officerUserIds) : Promise.resolve({ data: [], error: null }),
        (supabase as any).from("employment_offers").select("id,hire_id,job_application_id").eq("company_id", companyId).in("status", ["accepted", "legacy_accepted"]),
        (supabase as any).from("hires").select("id,employment_confirmed_at,status,hiring_application_id,offer_id").eq("company_id", companyId),
        (supabase as any).rpc("get_company_onboarding_progress", { _company_id: companyId }),
        (supabase as any).from("hire_screening_checks").select("*").eq("company_id", companyId).order("created_at"),
        (supabase as any).from("interview_schedules").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        (supabase as any).from("company_applicant_notes").select("id,job_application_id,note,updated_at").eq("company_id", companyId),
      ]);
      void unreadPromise.then((result) => {
        if (!result.error) setUnreadCount(result.count || 0);
      });
      if (offersResult.error) console.error("Failed to match accepted offers", offersResult.error);
      if (hiresResult.error) console.error("Failed to load hire confirmation state", hiresResult.error);
      if (progressResult.error) console.error("Failed to load onboarding progress", progressResult.error);
      if (screeningResult.error) console.error("Failed to load screening checks", screeningResult.error);
      if (interviewsResult.error) console.error("Failed to load interviews", interviewsResult.error);
      if (notesResult.error) console.error("Failed to load applicant notes", notesResult.error);

      const profileById = new Map((profilesResult.data || []).map((entry: any) => [entry.id, entry]));
      const progressByHire = new Map((progressResult.data || []).map((entry: any) => [entry.hire_id, entry]));
      const hireByApplication = new Map((offersResult.data || []).filter((offer: any) => offer.job_application_id && offer.hire_id).map((offer: any) => [offer.job_application_id, offer.hire_id]));
      const offerByApplication = new Map<string, any>((offersResult.data || []).filter((offer: any) => offer.job_application_id).map((offer: any) => [offer.job_application_id, offer]));
      const hireStateById = new Map<string, any>((hiresResult.data || []).map((hire: any) => [hire.id, hire]));
      const screeningByHire = new Map<string, any[]>();
      for (const check of screeningResult.data || []) screeningByHire.set(check.hire_id, [...(screeningByHire.get(check.hire_id) || []), check]);
      const interviewByApplication = new Map<string, any>();
      for (const interview of interviewsResult.data || []) if (!interviewByApplication.has(interview.job_application_id)) interviewByApplication.set(interview.job_application_id, interview);
      const noteByApplication = new Map((notesResult.data || []).map((note: any) => [note.job_application_id, note]));
      const applicationRows = (data || []).map((app: any) => {
        const hiringApplications = [...(app.hiring_application || [])].sort((left: any, right: any) => new Date(right.submitted_at || right.created_at || 0).getTime() - new Date(left.submitted_at || left.created_at || 0).getTime());
        const offerApplication = hiringApplications.find((application: any) =>
          application.status === "submitted"
          || Boolean(application.submitted_at)
          || application.evidence_snapshot_status === "complete"
        ) || hiringApplications[0];
        const profile = profileById.get(app.officer?.user_id) as any;
        const hireId = (hireByApplication.get(app.id) as string) || "";
        const screeningChecks = screeningByHire.get(hireId) || [];
        return {
          ...app,
          hiring_application: hiringApplications,
          offerHiringApplicationId: offerApplication?.id || null,
          officerName: profile?.full_name || "Unknown",
          officerAvatar: profile?.avatar_url || null,
          officerEmail: profile?.email || "",
          officerPhone: app.officer?.phone || "",
          hireId,
          offerId: offerByApplication.get(app.id)?.id || hireStateById.get(hireId)?.offer_id || null,
          hiringApplicationId: hireStateById.get(hireId)?.hiring_application_id || offerApplication?.id || null,
          employmentConfirmedAt: hireStateById.get(hireId)?.employment_confirmed_at || null,
          hireStatus: hireStateById.get(hireId)?.status || null,
          onboardingProgress: progressByHire.get(hireId) || null,
          screeningChecks,
          screeningReady: screeningChecks.length > 0 && screeningChecks.filter((check: any) => check.required).every((check: any) => check.status === "cleared"),
          interview: interviewByApplication.get(app.id) || null,
          companyNote: noteByApplication.get(app.id) || null,
        };
      });
      setApplications(applicationRows.filter((app: any) => !app.employmentConfirmedAt && app.hireStatus !== "not_hired"));
      setLoadError("");
    } catch (error) {
      console.error("Failed to load applications:", error);
      if (showLoading) setLoadError("Applicants could not be loaded. Please try again.");
    } finally {
      if (showLoading) setInitialLoading(false);
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
  const positions = useMemo(() => Array.from(new Set(applications.map((app) => app.job_posting?.title).filter(Boolean))).sort(), [applications]);
  const filteredApplications = useMemo(() => applications.filter((app) => {
    const matchesSearch = !deferredSearchQuery || [app.officerName, app.officerEmail, app.officerPhone, app.job_posting?.title]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(deferredSearchQuery));
    const matchesStage = stageFilter === "all" || getApplicantFilterStage(app) === stageFilter;
    const matchesPosition = positionFilter === "all" || app.job_posting?.title === positionFilter;
    return matchesSearch && matchesStage && matchesPosition;
  }), [applications, deferredSearchQuery, positionFilter, stageFilter]);
  const hasActiveFilters = Boolean(searchQuery.trim()) || stageFilter !== "all" || positionFilter !== "all";

  const activeApplication = selectedOfficerId
    ? applications.find((application) => application.officer?.id === selectedOfficerId || application.id === selectedOfficerId)
    : null;

  if (activeApplication && isPaidSubscriber) {
    const onboarding = getOnboardingStatus(activeApplication.onboardingProgress);
    const nextStep = getNextStep(activeApplication, onboarding);
    const openChat = () => {
      setSelectedOfficer({ id: activeApplication.officer.id, name: activeApplication.officerName, jobApplicationId: activeApplication.id, jobTitle: activeApplication.job_posting?.title });
      setChatOpen(true);
    };

    return (
      <div className="mx-auto max-w-7xl overflow-hidden rounded-lg border bg-background">
        <OfficerRecordShell
          context="applicant"
          backLabel="Back to applicants"
          onBack={() => onCloseOfficer?.()}
          officer={{
            id: activeApplication.officer.id,
            name: activeApplication.officerName,
            title: activeApplication.job_posting?.title || "Security Officer",
            officerNumber: activeApplication.officer?.officer_number,
            avatarUrl: activeApplication.officerAvatar,
            email: activeApplication.officerEmail,
            phone: activeApplication.officerPhone,
            location: activeApplication.officer?.location,
            stage: getApplicantFilterStage(activeApplication),
            employmentStatus: String(activeApplication.status || "submitted").replace(/_/g, " "),
          }}
          actions={<>
            <Button size="sm" variant="secondary" onClick={() => setReviewApplication(activeApplication)}>Review application</Button>
            <Button size="sm" variant="secondary" onClick={openChat}><MessageCircle className="mr-2 h-4 w-4" />Chat</Button>
            <InterviewScheduler companyId={companyId} companyName={companyProfile?.company_name || "The company"} officerId={activeApplication.officer.id} officerName={activeApplication.officerName} jobApplicationId={activeApplication.id} jobTitle={activeApplication.job_posting?.title || "Security Officer"} applicationStatus={activeApplication.status} existingInterview={activeApplication.interview} onChanged={loadApplications} />
            {activeApplication.offerHiringApplicationId && activeApplication.status !== "accepted" ? <HireButton officerId={activeApplication.officer.id} officerName={activeApplication.officerName} companyId={companyId} hiringApplicationId={activeApplication.offerHiringApplicationId} jobApplicationId={activeApplication.id} jobTitle={activeApplication.job_posting?.title} onChanged={loadApplications} /> : null}
          </>}
          tabs={[
            { value: "overview", label: "Overview", content: <div className="grid gap-6 lg:grid-cols-2"><section><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Current stage</h2><div className={`mt-3 rounded-lg border p-4 ${nextStep.tone}`}><p className="text-xs font-bold uppercase tracking-wide opacity-70">What happens next</p><p className="mt-1 font-semibold">{nextStep.label.replace(/^Next:\s*/, "")}</p></div></section><section><h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Application details</h2><dl className="mt-3 divide-y rounded-lg border"><div className="flex justify-between gap-4 p-3"><dt className="text-sm text-muted-foreground">Position</dt><dd className="text-sm font-semibold">{activeApplication.job_posting?.title || "Security Officer"}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-sm text-muted-foreground">Applied</dt><dd className="text-sm font-semibold">{activeApplication.applied_at ? new Date(activeApplication.applied_at).toLocaleDateString() : "Not recorded"}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-sm text-muted-foreground">Stage</dt><dd className="text-sm font-semibold capitalize">{getApplicantFilterStage(activeApplication)}</dd></div></dl></section></div> },
            { value: "application", label: "Application", content: <div className="max-w-3xl"><h2 className="text-lg font-bold">Submitted hiring application</h2><p className="mt-1 text-sm text-muted-foreground">Review the officer’s submitted answers, work history, qualifications, availability, and signature.</p><Button className="mt-5" onClick={() => setReviewApplication(activeApplication)}>Open application</Button></div> },
            { value: "onboarding", label: "Onboarding", content: <div className="max-w-3xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">{onboarding.label}</h2><p className="mt-1 text-sm text-muted-foreground">{onboarding.detail}</p></div><Badge variant="outline">{onboarding.percent}%</Badge></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className={onboarding.percent === 100 ? "h-full bg-emerald-600" : "h-full bg-primary"} style={{ width: `${onboarding.percent}%` }} /></div>{activeApplication.status === "accepted" && activeApplication.onboardingProgress?.packet_id ? <Button className="mt-5" variant="outline" onClick={() => setOnboardingApplication(activeApplication)}>Review onboarding</Button> : null}</div> },
            { value: "screening", label: "Screening", content: <div><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold">Pre-employment screening</h2><p className="text-sm text-muted-foreground">Review required checks after onboarding is submitted.</p></div>{activeApplication.hireId ? <Button variant="outline" onClick={() => setScreeningApplication(activeApplication)}>Review screening</Button> : null}</div><div className="divide-y rounded-lg border">{(activeApplication.screeningChecks || []).length ? activeApplication.screeningChecks.map((check: any) => <div key={check.id} className="flex items-center justify-between p-3"><span className="font-medium capitalize">{String(check.check_type).replace(/_/g, " ")}</span><Badge variant="outline" className="capitalize">{String(check.status).replace(/_/g, " ")}</Badge></div>) : <p className="p-6 text-sm text-muted-foreground">Screening checks have not been created.</p>}</div></div> },
            { value: "documents", label: "Documents", content: <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setReviewApplication(activeApplication)}>Application</Button><Button variant="outline" disabled={!activeApplication.onboardingProgress?.packet_id} onClick={() => setOnboardingApplication(activeApplication)}><FileCheck2 className="mr-2 h-4 w-4" />Onboarding packet</Button></div> },
            { value: "site", label: "Site and Schedule", content: <dl className="max-w-3xl divide-y rounded-lg border"><div className="flex justify-between gap-4 p-3"><dt className="text-sm text-muted-foreground">Position</dt><dd className="text-sm font-semibold">{activeApplication.job_posting?.title || "Security Officer"}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-sm text-muted-foreground">Location</dt><dd className="text-sm font-semibold">{activeApplication.job_posting?.location || activeApplication.officer?.location || "Not recorded"}</dd></div><div className="flex justify-between gap-4 p-3"><dt className="text-sm text-muted-foreground">Schedule</dt><dd className="text-sm font-semibold">{activeApplication.job_posting?.schedule || "Not recorded"}</dd></div></dl> },
            { value: "notes", label: "Notes", content: <div className="max-w-3xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Company notes</h2><Button size="sm" onClick={() => setNotesApplication(activeApplication)}><StickyNote className="mr-2 h-4 w-4" />{activeApplication.companyNote?.note ? "Edit note" : "Add note"}</Button></div><div className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">{activeApplication.companyNote?.note || "No company notes recorded."}</div></div> },
            { value: "evaluations", label: "Evaluations", content: <p className="text-sm text-muted-foreground">Performance evaluations become available after the officer is hired and onboarding is accepted.</p> },
            { value: "history", label: "History", content: <div className="divide-y rounded-lg border"><div className="grid gap-1 p-4 sm:grid-cols-[180px_1fr_auto]"><p className="font-medium">Application</p><p className="text-sm text-muted-foreground">Application status changed to <span className="capitalize">{String(activeApplication.status || "submitted").replace(/_/g, " ")}</span>.</p><time className="text-xs text-muted-foreground">{activeApplication.updated_at ? new Date(activeApplication.updated_at).toLocaleString() : ""}</time></div>{activeApplication.interview ? <div className="grid gap-1 p-4 sm:grid-cols-[180px_1fr_auto]"><p className="font-medium">Interview</p><p className="text-sm text-muted-foreground capitalize">{String(activeApplication.interview.status || "scheduled").replace(/_/g, " ")}</p><time className="text-xs text-muted-foreground">{activeApplication.interview.scheduled_at ? new Date(activeApplication.interview.scheduled_at).toLocaleString() : ""}</time></div> : null}</div> },
          ]}
        />
        {chatOpen && selectedOfficer && companyProfile ? <ChatDialog open={chatOpen} onOpenChange={setChatOpen} companyId={companyId} companyName={companyProfile.company_name} officerId={selectedOfficer.id} officerName={selectedOfficer.name} currentUserType="company" jobApplicationId={selectedOfficer.jobApplicationId} jobTitle={selectedOfficer.jobTitle} /> : null}
        <ApplicantReviewDialog open={Boolean(reviewApplication)} onOpenChange={(open) => !open && setReviewApplication(null)} application={reviewApplication} />
        <OnboardingDocumentsDialog open={Boolean(onboardingApplication)} onOpenChange={(open) => !open && setOnboardingApplication(null)} application={onboardingApplication} onAccepted={loadApplications} />
        <PreEmploymentScreeningDialog open={Boolean(screeningApplication)} onOpenChange={(open) => !open && setScreeningApplication(null)} application={screeningApplication} onChanged={loadApplications} />
        <ApplicantNotesDialog open={Boolean(notesApplication)} onOpenChange={(open) => !open && setNotesApplication(null)} companyId={companyId} application={notesApplication} onSaved={loadApplications} />
      </div>
    );
  }

  return (
    <Card className="overflow-visible border-0 bg-transparent shadow-none">
      <CardHeader className="sr-only">
        <div className="flex flex-wrap items-center gap-3"><CardTitle>Applicants</CardTitle>{applications.length > 0 && <Badge variant="secondary" className="rounded-full">{applications.length} total</Badge>}{unreadCount > 0 && <Badge className="rounded-full">{unreadCount} new message{unreadCount === 1 ? "" : "s"}</Badge>}</div>
        <CardDescription>
          Officers who have expressed interest in your positions
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
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

        {initialLoading && <div className="mb-2 space-y-2 border-y bg-muted/20 px-2 py-2" aria-hidden="true">
          <div className="flex flex-col gap-2 lg:flex-row"><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 lg:w-52" /><Skeleton className="h-10 lg:w-52" /></div>
          <div className="flex items-center justify-between"><Skeleton className="h-4 w-28" /><Skeleton className="h-10 w-44" /></div>
        </div>}
        {!initialLoading && applications.length > 0 && <div className="mb-2 space-y-2 border-y bg-muted/20 px-2 py-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search applicants" className="bg-background pl-9" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search name, email, phone, or position" /></div>
            <Select value={stageFilter} onValueChange={setStageFilter}><SelectTrigger className="bg-background lg:w-52" aria-label="Filter applicants by stage"><SelectValue placeholder="All stages" /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem><SelectItem value="review">Needs review</SelectItem><SelectItem value="interview">Interview</SelectItem><SelectItem value="offer">Offer</SelectItem><SelectItem value="onboarding">Onboarding</SelectItem><SelectItem value="screening">Screening / final review</SelectItem></SelectContent></Select>
            <Select value={positionFilter} onValueChange={setPositionFilter}><SelectTrigger className="bg-background lg:w-52" aria-label="Filter applicants by position"><SelectValue placeholder="All positions" /></SelectTrigger><SelectContent><SelectItem value="all">All positions</SelectItem>{positions.map((position) => <SelectItem key={position} value={position}>{position}</SelectItem>)}</SelectContent></Select>
            {hasActiveFilters && <Button type="button" variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setStageFilter("all"); setPositionFilter("all"); }}><X className="mr-1.5 h-4 w-4" />Clear</Button>}
          </div>
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Showing {filteredApplications.length} of {applications.length}</p><span className="text-xs font-medium text-muted-foreground">Compact roster</span></div>
        </div>}
        <div className="applicant-roster border bg-background">
          {!initialLoading && applications.length > 0 && <div className="applicant-roster-heading border-b bg-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span>Officer</span><span>Hiring stage</span><span>Onboarding</span><span className="text-right">Actions</span></div>}
          {initialLoading ? (
            <div role="status" aria-live="polite">
              <p className="sr-only">Loading applicants</p>
              <div aria-hidden="true">
                {[0, 1, 2, 3].map((item) => <div key={item} className="flex h-16 items-center gap-4 border-b px-3 last:border-b-0"><Skeleton className="h-9 w-9 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-36" /><Skeleton className="h-3 w-52" /></div><Skeleton className="h-7 w-28" /><Skeleton className="h-7 w-64" /></div>)}
              </div>
            </div>
          ) : loadError ? (
            <div className="col-span-full rounded-xl border border-dashed px-6 py-10 text-center"><p className="font-medium text-foreground">We couldn't load applicants</p><p className="mt-1 text-sm text-muted-foreground">{loadError}</p><Button type="button" variant="outline" className="mt-4" onClick={() => void loadApplications(true)}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div>
          ) : applications.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No applications yet. Post jobs to attract security officers.
            </p>
          ) : (
            filteredApplications.map((app) => {
              const onboarding = getOnboardingStatus(app.onboardingProgress);
              const nextStep = getNextStep(app, onboarding);
              return (
              <div key={app.id} className="applicant-roster-row border-b px-3 py-3 last:border-b-0 hover:bg-slate-50/70">
                <div className="min-w-0">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ProfileAvatar name={app.officerName} email={app.officerEmail} src={app.officerAvatar} />
                      <div className="min-w-0">
                        <span className="block truncate font-semibold leading-tight text-foreground">{isPaidSubscriber ? app.officerName : getMaskedName(app.officerName)}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{app.job_posting?.title || "Security Officer"}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 pl-12">
                      {isPaidSubscriber && app.officerPhone && (
                        <a href={`tel:${app.officerPhone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                          <Phone className="h-3 w-3" />
                          {app.officerPhone}
                        </a>
                      )}
                      {isPaidSubscriber && app.officerEmail && (
                        <a href={`mailto:${app.officerEmail}`} className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="break-all">{app.officerEmail}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <Badge variant="outline" className={`max-w-full whitespace-normal text-left leading-snug ${nextStep.tone}`}>{nextStep.label.replace(/^Next:\s*/, "")}</Badge>
                </div>
                <div className="min-w-0">{app.status === "accepted" ? <div className="flex items-center gap-2"><Badge variant="outline" className={`shrink-0 whitespace-nowrap ${onboarding.percent === 100 ? "border-green-200 bg-green-50 text-green-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{onboarding.percent}%</Badge><span className="text-xs leading-snug text-muted-foreground">{onboarding.percent === 100 ? "Complete" : onboarding.label.replace("Onboarding: ", "")}</span></div> : <span className="text-xs text-muted-foreground">Not started</span>}</div>

                {isPaidSubscriber ? (
                  <div className="applicant-roster-actions">
                    <Button 
                      size="sm"
                      className="shadow-none"
                      onClick={() => onOpenOfficer?.(app.officer.id)}
                    >
                      View profile
                    </Button>
                    {app.status === "accepted" && onboarding.percent === 100 && app.hireId ? (
                      <Button size="sm" variant="outline" onClick={() => setScreeningApplication(app)}>Review screening</Button>
                    ) : app.status === "accepted" && app.onboardingProgress?.packet_id ? (
                      <Button size="sm" variant="outline" onClick={() => setOnboardingApplication(app)}>View onboarding</Button>
                    ) : app.offerHiringApplicationId && app.status !== "accepted" ? (
                      <HireButton officerId={app.officer.id} officerName={app.officerName} companyId={companyId} hiringApplicationId={app.offerHiringApplicationId} jobApplicationId={app.id} jobTitle={app.job_posting?.title} onChanged={loadApplications} />
                    ) : null}
                    <details name="applicant-row-actions" className="applicant-more" onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.currentTarget.open = false;
                        event.currentTarget.querySelector("summary")?.focus();
                      }
                    }}>
                      <summary aria-label={`More actions for ${isPaidSubscriber ? app.officerName : getMaskedName(app.officerName)}`}>More</summary>
                      <div className="applicant-more-panel">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100 hover:text-amber-900"
                      onClick={() => setNotesApplication(app)}
                    >
                      <StickyNote className="mr-1.5 h-3.5 w-3.5" />
                      {app.companyNote?.note ? "View notes" : "Add note"}
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
                      <Button size="sm" variant="outline" className="border-teal-200 bg-teal-50 text-teal-800 hover:border-teal-300 hover:bg-teal-100 hover:text-teal-900" onClick={() => setOnboardingApplication(app)}>
                        <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
                        View onboarding
                      </Button>
                    )}
                    {app.status === "accepted" && onboarding.percent === 100 && app.hireId && (
                      <Button size="sm" variant="outline" className="border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-300 hover:bg-orange-100 hover:text-orange-900" onClick={() => setScreeningApplication(app)}>
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Review screening
                      </Button>
                    )}
                      </div>
                    </details>
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
          {applications.length > 0 && filteredApplications.length === 0 && <div className="col-span-full rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No applicants match the selected filters.</div>}
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
      <OnboardingDocumentsDialog open={Boolean(onboardingApplication)} onOpenChange={(open) => !open && setOnboardingApplication(null)} application={onboardingApplication} onAccepted={loadApplications} />
      <PreEmploymentScreeningDialog open={Boolean(screeningApplication)} onOpenChange={(open) => !open && setScreeningApplication(null)} application={screeningApplication} onChanged={loadApplications} />
      <ApplicantNotesDialog open={Boolean(notesApplication)} onOpenChange={(open) => !open && setNotesApplication(null)} companyId={companyId} application={notesApplication} onSaved={loadApplications} />
    </Card>
  );
};

export default JobApplicants;
