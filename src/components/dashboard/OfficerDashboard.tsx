import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Award, Video, User, Briefcase, Clock, Upload, FileText, Info, CheckCircle2, Circle, ClipboardCheck, LockKeyhole, CalendarPlus, MapPin, CalendarClock, ArrowRight, Images, MessageCircle, Search, ClipboardList, Settings, type LucideIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CertificationsManager } from "./CertificationsManager";
import { OfficerPhotos } from "./OfficerPhotos";
import { VideoInterviewsManager } from "./VideoInterviewsManager";
import { WorkHistory } from "./WorkHistory";
import { OfficerMessages } from "./OfficerMessages";
import { OfficerChatPanel } from "./OfficerChatPanel";
import { InterestedJobsPanel } from "./InterestedJobsPanel";
import JobSearch from "./JobSearch";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OfficerSidebar } from "./OfficerSidebar";
import { useExpiringCredentials } from "@/hooks/useExpiringCredentials";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { GuardHiringApplication } from "./GuardHiringApplication";
import { OfficerEmployeeOnboarding } from "./OfficerEmployeeOnboarding";
import { OfficerOfferReview } from "./OfficerOfferReview";
import { useSearchParams } from "@/lib/router-compat";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatUsPhone } from "@/lib/phone";
import { AccountSettings } from "./AccountSettings";
import { ProfileAvatar } from "./ProfileAvatar";
import { DashboardSectionHeader } from "./DashboardSectionHeader";

interface OfficerDashboardProps {
  userId: string;
  initialTab?: string;
}

const officerTabs = new Set(["overview", "hiring-application", "employee-onboarding", "profile", "availability", "photos", "certifications", "work-history", "interview-history", "videos", "find-jobs", "messages", "account"]);

const officerSectionDetails: Record<string, { title: string; description: string; icon: LucideIcon }> = {
  "hiring-application": { title: "Hiring application", description: "Review the application and information you submitted to employers.", icon: ClipboardList },
  "employee-onboarding": { title: "Employee onboarding", description: "Complete and review your new-hire paperwork.", icon: ClipboardCheck },
  profile: { title: "Professional profile", description: "Update the information employers use to evaluate you.", icon: User },
  availability: { title: "Availability", description: "Keep your preferred shifts and work hours current.", icon: Clock },
  photos: { title: "Professional photos", description: "Manage the photos shared with employers.", icon: Images },
  certifications: { title: "Licenses and certificates", description: "Keep credentials and training records current.", icon: Award },
  "work-history": { title: "Work history", description: "Review and update your employment experience.", icon: Briefcase },
  "interview-history": { title: "Interview history", description: "Review past interviews and attendance records.", icon: CalendarClock },
  videos: { title: "Video interviews", description: "Record and manage videos requested by employers.", icon: Video },
  "find-jobs": { title: "Find a job", description: "Explore security opportunities that match your experience.", icon: Search },
  messages: { title: "Messages", description: "Continue conversations with potential employers.", icon: MessageCircle },
  account: { title: "Account settings", description: "Update your name, username, profile picture, or password.", icon: Settings },
};

const getPrivateFilePath = (value: string | null | undefined, bucket: string) => {
  if (!value) return null;

  const bucketMarker = `/${bucket}/`;
  const markerIndex = value.indexOf(bucketMarker);
  const path = markerIndex >= 0 ? value.slice(markerIndex + bucketMarker.length) : value;

  return decodeURIComponent(path.split("?")[0]);
};

const OfficerDashboard = ({ userId, initialTab = "overview" }: OfficerDashboardProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(requestedTab && officerTabs.has(requestedTab) ? requestedTab : initialTab);
  const dashboardTopRef = useRef<HTMLDivElement>(null);
  const sectionHeaderRef = useRef<HTMLDivElement>(null);
  const [officerProfile, setOfficerProfile] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [certCount, setCertCount] = useState(0);
  const [trainingCount, setTrainingCount] = useState(0);
  const expiringItems = useExpiringCredentials(userId, "officer");
  const urgentExpiring = expiringItems.some((item) => item.daysLeft <= 30);
  const [photoCount, setPhotoCount] = useState(0);
  const [workHistoryCount, setWorkHistoryCount] = useState(0);
  const [videoInterviewCount, setVideoInterviewCount] = useState(0);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const [employeeOnboardingSubmitted, setEmployeeOnboardingSubmitted] = useState(false);
  const [completedOnboardingRecord, setCompletedOnboardingRecord] = useState<any>(null);
  const [employmentConfirmedAt, setEmploymentConfirmedAt] = useState<string | null>(null);
  const [onboardingReviewedAt, setOnboardingReviewedAt] = useState<string | null>(null);
  const [onboardingOfferAvailable, setOnboardingOfferAvailable] = useState(false);
  const [onboardingOfferLoaded, setOnboardingOfferLoaded] = useState(false);
  const [pendingEmploymentOffer, setPendingEmploymentOffer] = useState<any>(null);
  const [acceptedEmploymentOffer, setAcceptedEmploymentOffer] = useState<any>(null);
  const [upcomingInterview, setUpcomingInterview] = useState<any>(null);
  const [interviewHistory, setInterviewHistory] = useState<any[]>([]);
  const [interviewResponding, setInterviewResponding] = useState(false);
  const [showCalendarOptions, setShowCalendarOptions] = useState(false);
  const [showInterviewChange, setShowInterviewChange] = useState(false);
  const [interviewChangeType, setInterviewChangeType] = useState<"reschedule" | "cancel">("reschedule");
  const [interviewChangeDate, setInterviewChangeDate] = useState("");
  const [interviewChangeTime, setInterviewChangeTime] = useState("");
  const [interviewChangeReason, setInterviewChangeReason] = useState("");
  const [showOfferPrompt, setShowOfferPrompt] = useState(false);
  const [requiredPhotosComplete, setRequiredPhotosComplete] = useState(false);
  const [certificationDocumentComplete, setCertificationDocumentComplete] = useState(false);
  const choseInitialExperience = useRef(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    title: "",
    bio: "",
    years_experience: "",
    phone: "",
    address_street: "",
    address_unit: "",
    address_city: "",
    address_state: "",
    address_zip: "",
    linkedin_url: "",
    desired_salary: "",
    employment_type: [] as string[],
    availability_schedule: {} as Record<string, { start: string; end: string }>,
    shift_preference: [] as string[],
  });
  const [quickSetStart, setQuickSetStart] = useState("");
  const [quickSetEnd, setQuickSetEnd] = useState("");
  const ensureOfficerProfilePromise = useRef<Promise<any> | null>(null);

  const selectTab = (tab: string) => {
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tab);
    setSearchParams(nextParams);
  };

  useEffect(() => {
    const nextTab = requestedTab && officerTabs.has(requestedTab) ? requestedTab : initialTab;
    setActiveTab((current) => current === nextTab ? current : nextTab);
  }, [initialTab, requestedTab]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (activeTab === "overview") {
        dashboardTopRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
        return;
      }
      sectionHeaderRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      sectionHeaderRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab]);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  useEffect(() => {
    if (!officerProfile?.id) return;

    const channel = supabase
      .channel(`officer-hire-status-${officerProfile.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "hires", filter: `officer_id=eq.${officerProfile.id}` },
        (payload) => {
          const updatedHire = payload.new as { employment_confirmed_at?: string | null; onboarding_reviewed_at?: string | null };
          if (updatedHire.employment_confirmed_at) setEmploymentConfirmedAt(updatedHire.employment_confirmed_at);
          setOnboardingReviewedAt(updatedHire.onboarding_reviewed_at || null);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [officerProfile?.id]);

  useEffect(() => {
    if (pendingEmploymentOffer?.id) setShowOfferPrompt(true);
  }, [pendingEmploymentOffer?.id]);

  useEffect(() => {
    if (!upcomingInterview?.scheduled_at || upcomingInterview.status === "cancelled") return;
    const remaining = new Date(upcomingInterview.scheduled_at).getTime() - Date.now();

    const moveToHistory = async () => {
      setUpcomingInterview(null);
      const { data, error } = await (supabase as any).rpc("get_my_interview_history");
      if (!error) setInterviewHistory(Array.isArray(data) ? data : []);
    };

    if (remaining <= 0) {
      void moveToHistory();
      return;
    }

    const timer = window.setTimeout(() => void moveToHistory(), Math.min(remaining + 1000, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [upcomingInterview?.id, upcomingInterview?.scheduled_at, upcomingInterview?.status]);

  const ensureOfficerProfile = async () => {
    if (officerProfile) return officerProfile;
    if (ensureOfficerProfilePromise.current) return ensureOfficerProfilePromise.current;

    ensureOfficerProfilePromise.current = (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error("You must be logged in");
          return null;
        }

        // Prefer the service-backed ensure function, but do not leave a new
        // officer unable to onboard if that function has not been deployed yet.
        const functionResult = await supabase.functions.invoke('ensure-officer-profile', { body: {} });
        if (functionResult.error) console.warn("Officer profile function unavailable; using direct fallback", functionResult.error);

        let { data: ensured, error: selectError } = await supabase
          .from('officer_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (selectError) throw selectError;

        if (!ensured) {
          const { data: created, error: createError } = await supabase
            .from('officer_profiles')
            .upsert({ user_id: user.id } as any, { onConflict: 'user_id' })
            .select('*')
            .single();
          if (createError) throw createError;
          ensured = created;
        }

        if (ensured) setOfficerProfile(ensured);
        return ensured ?? null;
      } catch (error: any) {
        console.error("Failed to create officer profile", error);
        toast.error(error.message || "Failed to create profile");
        return null;
      } finally {
        ensureOfficerProfilePromise.current = null;
      }
    })();

    return ensureOfficerProfilePromise.current;
  };

  const loadProfile = async () => {
    // Load profiles table for email
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    
    setProfile(profileData);

    // Load officer profile
    const { data } = await supabase
      .from("officer_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      setOfficerProfile(data);
      const nameParts = (profileData?.full_name || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      setFormData({
        first_name: firstName,
        last_name: lastName,
        title: data.title || "",
        bio: data.bio || "",
        years_experience: data.years_experience?.toString() || "",
        phone: formatUsPhone(data.phone || ""),
        address_street: data.address_street || "",
        address_unit: data.address_unit || "",
        address_city: data.address_city || "",
        address_state: data.address_state || "",
        address_zip: data.address_zip || "",
        linkedin_url: data.linkedin_url || "",
        desired_salary: data.desired_salary?.toString() || "",
        employment_type: data.employment_type || [],
        availability_schedule: (data.availability_schedule as Record<string, { start: string; end: string }>) || {},
        shift_preference: data.shift_preference || [],
      });

      // Load counts for completion status
      if (data.id) {
        const [certsResult, trainingsResult, workResult, videosResult, applicationResult, photosResult, employeeOnboardingResult, preparedOfferResult, confirmedHireResult, pendingOfferResult, acceptedOfferResult, interviewResult, interviewHistoryResult] = await Promise.all([
          supabase.from("certifications").select("id,document_front_url", { count: 'exact' }).eq("officer_id", data.id).neq("certification_type", "training"),
          supabase.from("certifications").select("id", { count: 'exact' }).eq("officer_id", data.id).eq("certification_type", "training"),
          supabase.from("work_history").select("id", { count: 'exact' }).eq("officer_id", data.id),
          supabase.from("video_interviews").select("id", { count: 'exact', head: true }).eq("officer_id", data.id),
          (supabase as any).from("guard_hiring_applications").select("status,application_type,submitted_at,evidence_snapshot_status").eq("officer_id", data.id).order("created_at", { ascending: false }).limit(20),
          supabase.storage.from("officer-photos").list(userId, { limit: 100 }),
          (supabase as any).from("officer_onboarding_packets").select("status,company_name,submitted_at").eq("officer_id", data.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("hires").select("id,hiring_application_id,offer_prepared_at,employment_confirmed_at").eq("officer_id", data.id).eq("status", "active").not("offer_prepared_at", "is", null).not("hiring_application_id", "is", null).order("offer_prepared_at", { ascending: false }).limit(1).maybeSingle(),
          (supabase as any).from("hires").select("employment_confirmed_at,onboarding_reviewed_at").eq("officer_id", data.id).eq("status", "active").not("employment_confirmed_at", "is", null).order("employment_confirmed_at", { ascending: false }).limit(1).maybeSingle(),
          (supabase as any).from("employment_offers").select("id,version,status,terms,viewed_at,sent_at").eq("officer_id", data.id).in("status", ["sent", "viewed"]).order("sent_at", { ascending: false }).limit(1).maybeSingle(),
          (supabase as any).from("employment_offers").select("id,version,status,terms,accepted_at").eq("officer_id", data.id).in("status", ["accepted", "legacy_accepted"]).order("accepted_at", { ascending: false }).limit(1).maybeSingle(),
          (supabase as any).rpc("get_my_upcoming_interview"),
          (supabase as any).rpc("get_my_interview_history"),
        ]);
        
        setCertCount(certsResult.count || 0);
        setTrainingCount(trainingsResult.count || 0);
        setWorkHistoryCount(workResult.count || 0);
        setVideoInterviewCount(videosResult.count || 0);
        setCertificationDocumentComplete((certsResult.data || []).some((cert: any) => Boolean(cert.document_front_url)));
        const storedApplications = Array.isArray(applicationResult.data) ? applicationResult.data : [];
        setApplicationSubmitted(storedApplications.some((application: any) =>
          application.status === "submitted"
          || Boolean(application.submitted_at)
          || (application.application_type === "employer_copy" && application.evidence_snapshot_status === "complete")
        ));
        setEmployeeOnboardingSubmitted(employeeOnboardingResult.data?.status === "submitted");
        setCompletedOnboardingRecord(employeeOnboardingResult.data?.status === "submitted" ? employeeOnboardingResult.data : null);
        if (confirmedHireResult.error) console.error("Failed to load confirmed employment status", confirmedHireResult.error);
        setEmploymentConfirmedAt((confirmedHireResult.data as any)?.employment_confirmed_at || null);
        setOnboardingReviewedAt((confirmedHireResult.data as any)?.onboarding_reviewed_at || null);
        if (pendingOfferResult.error) console.error("Failed to load pending employment offer", pendingOfferResult.error);
        setPendingEmploymentOffer(pendingOfferResult.data || null);
        setAcceptedEmploymentOffer(acceptedOfferResult.data || null);
        if (interviewResult.error && interviewResult.error.code !== "42P01") console.error("Failed to load upcoming interview", interviewResult.error);
        const nextInterview = interviewResult.data || null;
        setUpcomingInterview(nextInterview?.status === "cancelled" || (nextInterview?.scheduled_at && new Date(nextInterview.scheduled_at).getTime() > Date.now()) ? nextInterview : null);
        if (interviewHistoryResult.error && interviewHistoryResult.error.code !== "42883") console.error("Failed to load interview history", interviewHistoryResult.error);
        setInterviewHistory(Array.isArray(interviewHistoryResult.data) ? interviewHistoryResult.data : []);
        setOnboardingOfferAvailable(Boolean(pendingOfferResult.data?.id || (preparedOfferResult.data?.id && preparedOfferResult.data?.hiring_application_id)));
        setOnboardingOfferLoaded(true);
        const photoNames = (photosResult.data || []).map((file: any) => file.name.split(".")[0]);
        setPhotoCount(photoNames.length);
        setRequiredPhotosComplete(photoNames.includes("headshot") && photoNames.includes("full-body"));
        if (!choseInitialExperience.current) {
          choseInitialExperience.current = true;
          if (!requestedTab && (initialTab === "overview" || initialTab === "profile") && applicationResult.data?.status !== "submitted" && !confirmedHireResult.data?.employment_confirmed_at) selectTab("hiring-application");
        }
      }
    }
  };

  const handleResumeUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploadingResume(true);

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      const fileExt = file.name.split(".").pop();
      const filePath = `${userId}/resume.${fileExt}`;

      // Delete old resume if exists
      if (officerProfile?.resume_url) {
        const oldPath = getPrivateFilePath(officerProfile.resume_url, "resumes");
        if (oldPath) {
          await supabase.storage.from("resumes").remove([oldPath]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { error } = await supabase
        .from("officer_profiles")
        .update({ resume_url: filePath })
        .eq("user_id", userId);

      if (error) throw error;

      toast.success("Resume uploaded successfully!");
      loadProfile();
    } catch (error: any) {
      toast.error("Error uploading resume: " + error.message);
    } finally {
      setUploadingResume(false);
    }
  };

  const handleResumeOpen = async () => {
    const filePath = getPrivateFilePath(officerProfile?.resume_url, "resumes");
    if (!filePath) {
      toast.error("Resume file could not be found");
      return;
    }

    const { data, error } = await supabase.storage
      .from("resumes")
      .createSignedUrl(filePath, 300);

    if (error || !data?.signedUrl) {
      toast.error("Unable to open the resume securely");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    
    setLoading(true);

    try {
      // Get the current authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("You must be logged in to update your profile");
        return;
      }

      const fullName = `${formData.first_name} ${formData.last_name}`.trim();

      // Update the profiles table with the name
      if (fullName) {
        await supabase
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", user.id);
      }

      const profileData = {
        user_id: user.id,
        title: formData.title,
        bio: formData.bio,
        years_experience: parseInt(formData.years_experience) || null,
        phone: formData.phone,
        address_street: formData.address_street || null,
        address_unit: formData.address_unit || null,
        address_city: formData.address_city || null,
        address_state: formData.address_state || null,
        address_zip: formData.address_zip || null,
        linkedin_url: formData.linkedin_url,
        desired_salary: parseFloat(formData.desired_salary) || null,
        employment_type: formData.employment_type,
        availability_schedule: formData.availability_schedule,
        shift_preference: formData.shift_preference,
      };

      // Ensure a row exists via backend function before saving
      await ensureOfficerProfile();

      // Use upsert to handle both insert and update cases
      const { error } = await supabase
        .from("officer_profiles")
        .upsert(profileData, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      // Reflect the successful save immediately so sidebar completion does not
      // wait for a second network round trip. loadProfile below remains the
      // source-of-truth refresh and keeps the status correct after a reload.
      setOfficerProfile((current: any) => ({ ...current, ...profileData }));
      setProfile((current: any) => ({ ...current, full_name: fullName }));
      toast.success("Profile updated successfully!");
      await loadProfile();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate completion status for each tab
  const savedFullName = (profile?.full_name || `${formData.first_name} ${formData.last_name}`).trim();
  const completionStatus = {
    // Title, bio, LinkedIn, salary, and resume are optional enhancements. A
    // saved profile is complete once its core identity, contact, and address
    // information are present.
    profile: !!(savedFullName && officerProfile?.phone && officerProfile?.address_street &&
                officerProfile?.address_city && officerProfile?.address_state && officerProfile?.address_zip),
    availability: !!(officerProfile?.employment_type?.length && 
                     officerProfile?.shift_preference?.length &&
                     Object.keys(formData.availability_schedule).length > 0),
    photos: requiredPhotosComplete,
    certifications: certificationDocumentComplete,
    workHistory: workHistoryCount > 0,
    employeeOnboarding: employeeOnboardingSubmitted,
  };

  const onboardingItems = [
    { label: "Submit hiring application", complete: applicationSubmitted, tab: "hiring-application" },
    { label: acceptedEmploymentOffer ? "Offer accepted and signed" : pendingEmploymentOffer ? "Review and sign company offer" : "Await company offer", complete: Boolean(acceptedEmploymentOffer), tab: "employee-onboarding", locked: !onboardingOfferAvailable },
    { label: employeeOnboardingSubmitted ? "Employee onboarding submitted" : acceptedEmploymentOffer ? "Complete employee onboarding" : "Employee onboarding unlocks after acceptance", complete: employeeOnboardingSubmitted, tab: "employee-onboarding", locked: !acceptedEmploymentOffer },
    { label: "Set availability", complete: completionStatus.availability, tab: "availability" },
    { label: "Add headshot and full-body photo (optional)", complete: requiredPhotosComplete, tab: "photos", optional: true },
    { label: "Upload licenses or certificates (if applicable)", complete: certificationDocumentComplete, tab: "certifications", optional: true },
  ];
  const onboardingComplete = onboardingItems.filter((item) => !item.optional).every((item) => item.complete);
  const completedCompanyName = completedOnboardingRecord?.company_name || "your hiring company";

  const interviewCalendarDetails = () => {
    if (!upcomingInterview) return;
    const start = new Date(upcomingInterview.scheduled_at);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const companyName = upcomingInterview.company_name || "Company";
    const title = upcomingInterview.job_title || "Security Officer";
    const location = upcomingInterview.interview_type === "video" ? upcomingInterview.meeting_url : upcomingInterview.location;
    const description = [
      `Interview for ${title} with ${companyName}`,
      upcomingInterview.notes,
      upcomingInterview.meeting_url && upcomingInterview.interview_type !== "video" ? `Meeting link: ${upcomingInterview.meeting_url}` : null,
    ].filter(Boolean).join("\n\n");
    return { start, end, companyName, title, location: String(location || ""), description };
  };

  const downloadInterviewCalendarFile = () => {
    const details = interviewCalendarDetails();
    if (!details || !upcomingInterview) return;
    const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const escapeCalendarText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const { start, end, companyName, title, location, description } = details;
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//We Find Guards//Interview//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:${upcomingInterview.id}@wefindguards.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${escapeCalendarText(`Interview with ${companyName} — ${title}`)}`, `LOCATION:${escapeCalendarText(location)}`, `DESCRIPTION:${escapeCalendarText(description)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "we-find-guards-interview.ics"; link.click(); URL.revokeObjectURL(url);
    setShowCalendarOptions(false);
  };

  const openInterviewCalendar = () => {
    const details = interviewCalendarDetails();
    if (!details) return;
    const { start, end, companyName, title, location, description } = details;
    const summary = `Interview with ${companyName} — ${title}`;
    const params = new URLSearchParams();
    let url = "";
    const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    params.set("action", "TEMPLATE");
    params.set("text", summary);
    params.set("dates", `${stamp(start)}/${stamp(end)}`);
    params.set("details", description);
    params.set("location", location);
    url = `https://calendar.google.com/calendar/render?${params.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setShowCalendarOptions(false);
  };

  const respondToInterview = async (response: "accepted" | "declined") => {
    if (!upcomingInterview?.id) return;
    setInterviewResponding(true);
    try {
      const { data, error } = await (supabase as any).rpc("respond_to_interview", { _interview_id: upcomingInterview.id, _response: response });
      if (error) throw error;
      setUpcomingInterview((current: any) => ({ ...current, response_status: data?.response_status || response, responded_at: data?.responded_at || new Date().toISOString() }));
      toast.success(response === "accepted" ? "Interview accepted" : "Interview declined");
    } catch (error: any) {
      toast.error(error?.message || "Your response could not be saved");
    } finally {
      setInterviewResponding(false);
    }
  };

  const respondToInterviewChange = async (decision: "accepted" | "declined") => {
    if (!upcomingInterview?.id) return;
    setInterviewResponding(true);
    try {
      const { error } = await (supabase as any).rpc("respond_to_interview_change", {
        _interview_id: upcomingInterview.id,
        _decision: decision,
      });
      if (error) throw error;
      toast.success(decision === "accepted" ? "The new interview time is confirmed" : "The current interview time was kept");
      await loadProfile();
    } catch (error: any) {
      toast.error(error?.message || "Your response could not be saved");
    } finally {
      setInterviewResponding(false);
    }
  };

  const openInterviewChange = (type: "reschedule" | "cancel") => {
    setInterviewChangeType(type);
    setInterviewChangeReason("");
    if (upcomingInterview?.scheduled_at) {
      const scheduled = new Date(upcomingInterview.scheduled_at);
      setInterviewChangeDate(`${scheduled.getFullYear()}-${String(scheduled.getMonth() + 1).padStart(2, "0")}-${String(scheduled.getDate()).padStart(2, "0")}`);
      setInterviewChangeTime(`${String(scheduled.getHours()).padStart(2, "0")}:${String(scheduled.getMinutes()).padStart(2, "0")}`);
    }
    setShowInterviewChange(true);
  };

  const requestInterviewChange = async (reasonOverride?: string) => {
    const submittedReason = (reasonOverride ?? interviewChangeReason).trim();
    if (!upcomingInterview?.id || !submittedReason) {
      toast.error("Add a reason for this change");
      return;
    }
    let proposedAt: string | null = null;
    if (interviewChangeType === "reschedule") {
      const proposed = new Date(`${interviewChangeDate}T${interviewChangeTime}`);
      if (Number.isNaN(proposed.getTime()) || proposed <= new Date()) {
        toast.error("Choose a future date and time");
        return;
      }
      proposedAt = proposed.toISOString();
    }
    setInterviewResponding(true);
    try {
      const { error } = await (supabase as any).rpc("request_interview_change", {
        _interview_id: upcomingInterview.id,
        _request_type: interviewChangeType,
        _reason: submittedReason,
        _proposed_scheduled_at: proposedAt,
        _proposed_interview_type: interviewChangeType === "reschedule" ? upcomingInterview.interview_type : null,
        _proposed_location: interviewChangeType === "reschedule" ? upcomingInterview.location : null,
        _proposed_meeting_url: interviewChangeType === "reschedule" ? upcomingInterview.meeting_url : null,
      });
      if (error) throw error;
      toast.success(interviewChangeType === "cancel" ? "Interview canceled and the company was notified" : "Reschedule request sent to the company");
      setShowInterviewChange(false);
      await loadProfile();
    } catch (error: any) {
      toast.error(error?.message || "The interview change could not be sent");
    } finally {
      setInterviewResponding(false);
    }
  };

  const dismissInterviewCancellation = async () => {
    if (!upcomingInterview?.id) return;
    setInterviewResponding(true);
    try {
      const { error } = await (supabase as any).rpc("dismiss_interview_notice", { _interview_id: upcomingInterview.id });
      if (error) throw error;
      setUpcomingInterview(null);
      toast.success("Cancellation notice dismissed");
    } catch (error: any) {
      toast.error(error?.message || "The notice could not be dismissed");
    } finally {
      setInterviewResponding(false);
    }
  };

  const handleTabChange = (tab: string) => {
    if (tab === "employee-onboarding" && onboardingOfferLoaded && !onboardingOfferAvailable) {
      toast.info("Employee onboarding will unlock after a company sends you a completed offer");
      return;
    }
    selectTab(tab);
  };

  const onboardingChecklist = (compact = false) => (
    <Card className={`rounded-2xl border-primary/20 bg-primary/5 ${compact ? "shadow-sm" : "mb-6 xl:hidden"}`}>
      <CardHeader className={compact ? "p-4 pb-2" : "pb-3"}>
        <CardTitle className={`flex items-center gap-2 ${compact ? "text-base" : "text-lg"}`}><ClipboardCheck className="h-5 w-5 text-primary" />{compact ? "Application progress" : "Finish your onboarding"}</CardTitle>
        <CardDescription>{compact ? "Your next steps stay visible while you work." : "Complete these items so employers can review your profile."}</CardDescription>
      </CardHeader>
      <CardContent className={compact ? "grid gap-2 p-4 pt-2" : "grid gap-2 sm:grid-cols-2"}>{onboardingItems.map((item) => <button key={item.label} type="button" disabled={item.locked} onClick={() => handleTabChange(item.tab)} className="flex min-w-0 items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors enabled:hover:border-primary/30 enabled:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70">{item.locked ? <LockKeyhole className="h-4 w-4 shrink-0 text-amber-600" /> : item.complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}<span className={`min-w-0 text-sm leading-tight ${item.complete ? "text-muted-foreground line-through" : "font-medium"}`}>{item.label}</span></button>)}</CardContent>
    </Card>
  );

  return (
    <SidebarProvider>
      <div ref={dashboardTopRef} className="flex w-full min-h-screen scroll-mt-0">
        <Dialog open={showOfferPrompt && Boolean(pendingEmploymentOffer)} onOpenChange={setShowOfferPrompt}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <FileText className="h-6 w-6" />
              </div>
              <DialogTitle className="text-2xl">You have an offer to review</DialogTitle>
              <DialogDescription className="text-base">
                A company sent you an employment offer{pendingEmploymentOffer?.terms?.positionTitle ? ` for ${pendingEmploymentOffer.terms.positionTitle}` : ""}. Review the complete terms and PDF before accepting or declining.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setShowOfferPrompt(false)}>Review later</Button>
              <Button type="button" onClick={() => { setShowOfferPrompt(false); handleTabChange("employee-onboarding"); }}>
                Review offer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={showCalendarOptions} onOpenChange={setShowCalendarOptions}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-primary"><CalendarPlus className="h-6 w-6" /></div>
              <DialogTitle className="text-2xl">Add interview to your calendar</DialogTitle>
              <DialogDescription className="text-base">Choose the calendar you use. Your confirmed date, location or meeting link, and company instructions will be included.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <Button type="button" className="h-12 justify-start" onClick={openInterviewCalendar}>Google Calendar</Button>
              <Button type="button" variant="outline" className="h-12 justify-start" onClick={downloadInterviewCalendarFile}>Apple Calendar or another app (.ics)</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={showInterviewChange} onOpenChange={setShowInterviewChange}>
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle>{interviewChangeType === "cancel" ? "Cancel interview" : "Request a different time"}</DialogTitle>
              <DialogDescription>
                {interviewChangeType === "cancel"
                  ? `${upcomingInterview?.company_name || "The company"} will be notified immediately.`
                  : `${upcomingInterview?.company_name || "The company"} must accept your proposed time before the confirmed appointment changes.`}
              </DialogDescription>
            </DialogHeader>
            <form id="officer-interview-change-form" className="space-y-4 py-2" onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") || ""); setInterviewChangeReason(reason); void requestInterviewChange(reason); }}>
              {interviewChangeType === "reschedule" && <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label htmlFor="officer-reschedule-date">Proposed date</Label><Input id="officer-reschedule-date" type="date" value={interviewChangeDate} onChange={(event) => setInterviewChangeDate(event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="officer-reschedule-time">Proposed time</Label><select id="officer-reschedule-time" className="h-12 w-full rounded-md border bg-background px-3" value={interviewChangeTime} onChange={(event) => setInterviewChangeTime(event.target.value)}>{Array.from({ length: 96 }, (_, index) => { const hour = Math.floor(index / 4); const minute = (index % 4) * 15; const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`; const label = new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); return <option key={value} value={value}>{label}</option>; })}</select></div>
              </div>}
              <div className="space-y-2"><Label htmlFor="officer-change-reason">Reason *</Label><Textarea id="officer-change-reason" name="reason" value={interviewChangeReason} onChange={(event) => setInterviewChangeReason(event.target.value)} placeholder={interviewChangeType === "cancel" ? "Why are you canceling?" : "Why do you need a different time?"} required /></div>
            </form>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setShowInterviewChange(false)}>Keep interview</Button><Button type="submit" form="officer-interview-change-form" variant={interviewChangeType === "cancel" ? "destructive" : "default"} disabled={interviewResponding}>{interviewResponding ? "Sending…" : interviewChangeType === "cancel" ? "Cancel interview" : "Send request"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <OfficerSidebar 
          activeTab={activeTab} 
          onTabChange={handleTabChange}
          completionStatus={completionStatus}
          onboardingAvailable={onboardingOfferAvailable}
          onboardingOfferLoaded={onboardingOfferLoaded}
          offerNeedsResponse={Boolean(pendingEmploymentOffer)}
          employmentConfirmed={Boolean(employmentConfirmedAt)}
        />
        <div className="flex min-w-0 flex-1">
          <div className={`min-w-0 flex-1 p-4 sm:p-6 ${activeTab === "employee-onboarding" ? "lg:px-6 lg:py-8" : "lg:p-8"}`}>
            <div className="mb-4">
              <SidebarTrigger />
            </div>
            <button type="button" onClick={() => handleTabChange("account")} className={`mb-4 items-center gap-3 rounded-xl text-left transition-opacity hover:opacity-80 ${activeTab === "overview" ? "flex" : "hidden"}`} aria-label="Open account settings">
              <ProfileAvatar name={profile?.full_name} email={profile?.email} src={profile?.avatar_url} className="h-11 w-11" />
              <span><span className="block text-2xl font-bold sm:text-3xl">Welcome, {profile?.full_name || profile?.email}</span><span className="block text-sm text-muted-foreground">View account settings</span></span>
            </button>

            {activeTab !== "overview" && officerSectionDetails[activeTab] && <DashboardSectionHeader key={activeTab} ref={sectionHeaderRef} eyebrow="Officer workspace" title={officerSectionDetails[activeTab].title} description={officerSectionDetails[activeTab].description} icon={officerSectionDetails[activeTab].icon} status={employmentConfirmedAt ? { label: "Hired", tone: "green" } : onboardingComplete ? { label: "Awaiting company review", tone: "amber" } : undefined} />}

            {activeTab === "overview" && !onboardingReviewedAt && (employmentConfirmedAt || onboardingComplete) && (
              <div className={`mb-6 flex flex-col gap-3 rounded-2xl border px-5 py-4 shadow-sm sm:flex-row sm:items-center ${employmentConfirmedAt ? "border-green-200 bg-gradient-to-r from-green-50 via-emerald-50/70 to-background" : "border-blue-200 bg-gradient-to-r from-blue-50 via-sky-50/70 to-background"}`}>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-bold uppercase tracking-[0.14em] ${employmentConfirmedAt ? "text-green-700" : "text-primary"}`}>{employmentConfirmedAt ? "Employment confirmed" : "Onboarding submitted"}</p>
                  <h2 className="mt-0.5 text-lg font-bold text-foreground">{employmentConfirmedAt ? `Congratulations—${completedCompanyName} has confirmed your hire!` : `Your part is complete—${completedCompanyName} will be in touch`}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {employmentConfirmedAt ? `Confirmed on ${new Date(employmentConfirmedAt).toLocaleDateString()}. ${completedCompanyName} will contact you with any remaining pre-employment or first-day instructions.` : `Your onboarding packet was submitted${completedOnboardingRecord?.submitted_at ? ` on ${new Date(completedOnboardingRecord.submitted_at).toLocaleDateString()}` : ""}. No further action is needed from you right now. ${completedCompanyName} will review your packet, complete the required background check and drug screening, and contact you with an update.`}
                  </p>
                </div>
                <span className={`w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${employmentConfirmedAt ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{employmentConfirmedAt ? "Hired" : "Awaiting company review"}</span>
              </div>
            )}

            {upcomingInterview && <Card className={`mb-6 rounded-2xl ${upcomingInterview.status === "cancelled" ? "border-red-200 bg-red-50/70" : "border-blue-200 bg-blue-50/70"}`}>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold uppercase tracking-wide text-primary">{upcomingInterview.status === "cancelled" ? "Interview canceled" : upcomingInterview.change_requested_by === "company" && upcomingInterview.change_request_status === "pending" ? "Reschedule request" : "Interview with company"}</p><Badge variant={upcomingInterview.status === "cancelled" ? "destructive" : upcomingInterview.response_status === "accepted" ? "default" : "secondary"}>{upcomingInterview.status === "cancelled" ? "Canceled" : upcomingInterview.change_request_status === "pending" ? "Response needed" : upcomingInterview.response_status === "accepted" ? "Confirmed" : upcomingInterview.response_status === "declined" ? "Declined" : "Response needed"}</Badge></div>
                  <h2 className="mt-1 text-lg font-bold">{upcomingInterview.company_name || "Company"} — {upcomingInterview.job_title || "Security Officer"}</h2>
                  {upcomingInterview.status === "cancelled" ? <div className="mt-3 rounded-xl border border-red-200 bg-white/80 p-3 text-sm"><strong>{upcomingInterview.company_name || "The company"} canceled this interview.</strong><p className="mt-1 whitespace-pre-line text-muted-foreground">Reason: {upcomingInterview.cancellation_reason || "No reason provided"}</p></div> : <>
                    <p className="mt-1 text-sm text-muted-foreground">Current appointment: {new Date(upcomingInterview.scheduled_at).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm"><MapPin className="h-4 w-4" />{upcomingInterview.interview_type === "video" ? upcomingInterview.meeting_url : upcomingInterview.location}</p>
                    {upcomingInterview.change_requested_by === "company" && upcomingInterview.change_request_status === "pending" && <div className="mt-3 rounded-xl border border-violet-200 bg-white/80 p-3 text-sm"><strong>{upcomingInterview.company_name || "The company"} requested a new time:</strong><p className="mt-1">{new Date(upcomingInterview.proposed_scheduled_at).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</p><p className="mt-1 whitespace-pre-line text-muted-foreground">Reason: {upcomingInterview.change_reason}</p></div>}
                    {upcomingInterview.change_requested_by === "officer" && upcomingInterview.change_request_status === "pending" && <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 p-3 text-sm"><strong>Waiting for {upcomingInterview.company_name || "the company"}</strong><p className="mt-1 text-muted-foreground">Your request for {new Date(upcomingInterview.proposed_scheduled_at).toLocaleString([], { dateStyle: "full", timeStyle: "short" })} is pending. The current appointment remains active.</p></div>}
                    {upcomingInterview.notes && <div className="mt-3 whitespace-pre-line rounded-xl border border-blue-200 bg-white/80 p-3 text-sm text-foreground"><span className="font-semibold">Company instructions</span><br />{upcomingInterview.notes}</div>}
                  </>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {upcomingInterview.status === "cancelled" && <Button type="button" variant="outline" onClick={() => void dismissInterviewCancellation()} disabled={interviewResponding}>Dismiss</Button>}
                  {upcomingInterview.status !== "cancelled" && upcomingInterview.change_requested_by === "company" && upcomingInterview.change_request_status === "pending" && <><Button type="button" onClick={() => void respondToInterviewChange("accepted")} disabled={interviewResponding}>Accept new time</Button><Button type="button" variant="outline" onClick={() => void respondToInterviewChange("declined")} disabled={interviewResponding}>Keep current time</Button></>}
                  {upcomingInterview.status !== "cancelled" && upcomingInterview.change_request_status !== "pending" && (!upcomingInterview.response_status || upcomingInterview.response_status === "pending") && <><Button type="button" onClick={() => void respondToInterview("accepted")} disabled={interviewResponding}>Accept interview</Button><Button type="button" variant="outline" onClick={() => void respondToInterview("declined")} disabled={interviewResponding}>Decline</Button></>}
                  {upcomingInterview.status !== "cancelled" && upcomingInterview.response_status === "accepted" && upcomingInterview.change_request_status !== "pending" && <><Button type="button" onClick={() => setShowCalendarOptions(true)}><CalendarPlus className="mr-2 h-4 w-4" />Add to Calendar</Button><Button type="button" variant="outline" onClick={() => openInterviewChange("reschedule")}><CalendarClock className="mr-2 h-4 w-4" />Request new time</Button><Button type="button" variant="outline" className="text-red-700" onClick={() => openInterviewChange("cancel")}>Cancel</Button></>}
                </div>
              </CardContent>
            </Card>}

            {!employmentConfirmedAt && !onboardingComplete && activeTab !== "hiring-application" && activeTab !== "employee-onboarding" && onboardingChecklist()}

            {activeTab === "profile" && !onboardingComplete && (
              <Alert className="mb-6 border-primary/20 bg-primary/5">
                <Info className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  <strong>Stand out to employers!</strong> Complete your profile with detailed information, 
                  upload a professional headshot and full-body photo, and showcase your certifications. 
                  A complete profile significantly increases your chances of being hired.
                </AlertDescription>
              </Alert>
            )}

          <div className={`${activeTab === "employee-onboarding" ? "w-full max-w-none" : "mx-auto max-w-6xl"} space-y-6 [&_input]:min-h-12 [&_textarea]:text-base [&_[role=combobox]]:min-h-12`}>
            {activeTab === "overview" && (
              <div className="space-y-5">
                <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Officer workspace</p><h2 className="mt-1 text-2xl font-bold">What would you like to do?</h2><p className="mt-1 text-sm text-muted-foreground">Every dashboard card opens the same destination as the side menu.</p></div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {([
                    ["hiring-application", "Hiring application", applicationSubmitted ? "Submitted" : "Complete and submit your application", ClipboardList],
                    ["employee-onboarding", "Employee onboarding", employeeOnboardingSubmitted ? "Submitted" : onboardingOfferAvailable ? "Continue your new-hire paperwork" : "Available after an accepted offer", ClipboardCheck],
                    ["profile", "Profile", completionStatus.profile ? "Complete" : "Add your contact and professional details", User],
                    ["availability", "Availability", completionStatus.availability ? "Complete" : "Set the shifts you can work", Clock],
                    ["photos", "Photos", `${photoCount} uploaded`, Images],
                    ["certifications", "Licenses and certificates", `${certCount + trainingCount} on file${urgentExpiring ? ` · ${expiringItems.length} expiring` : ""}`, Award],
                    ["work-history", "Work history", `${workHistoryCount} ${workHistoryCount === 1 ? "employer" : "employers"}`, Briefcase],
                    ["interview-history", "Interview history", `${interviewHistory.length} past ${interviewHistory.length === 1 ? "interview" : "interviews"}`, CalendarClock],
                    ["videos", "Video interviews", `${videoInterviewCount} uploaded`, Video],
                    ["find-jobs", "Find a job", "Browse open security positions", Search],
                    ["messages", "Messages", "Chat with potential employers", MessageCircle],
                    ["account", "Account settings", "Update your name, username, photo, or password", Settings],
                  ] as const).map(([tab, title, description, Icon]) => <button key={tab} type="button" onClick={() => handleTabChange(tab)} className="group flex min-h-28 items-start gap-4 rounded-2xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                    <span className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold">{title as string}</span><span className="mt-1 block text-sm text-muted-foreground">{description as string}</span></span><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </button>)}
                </div>
              </div>
            )}

            {activeTab === "profile" && (
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Professional Profile</CardTitle>
              <CardDescription>
                Update your profile information to attract potential employers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      placeholder="First Name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      placeholder="Last Name"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="title">
                      Professional Title
                    </Label>
                    <Input
                      id="title"
                      placeholder="e.g., Licensed Security Officer"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile?.email || ""}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">
                      Phone
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="123-456-7890"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: formatUsPhone(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="years_experience">Years of Experience</Label>
                    <Input
                      id="years_experience"
                      type="number"
                      placeholder="5"
                      value={formData.years_experience}
                      onChange={(e) => setFormData({ ...formData, years_experience: e.target.value })}
                    />
                  </div>

                  <AddressAutocomplete
                    value={{
                      street: formData.address_street,
                      unit: formData.address_unit,
                      city: formData.address_city,
                      state: formData.address_state,
                      zip: formData.address_zip,
                    }}
                    onChange={(address) => setFormData({
                      ...formData,
                      address_street: address.street,
                      address_unit: address.unit,
                      address_city: address.city,
                      address_state: address.state,
                      address_zip: address.zip,
                    })}
                  />

                  <div className="space-y-2">
                    <Label htmlFor="desired_salary">Desired Annual Salary ($)</Label>
                    <Input
                      id="desired_salary"
                      type="number"
                      placeholder="50000"
                      value={formData.desired_salary}
                      onChange={(e) => setFormData({ ...formData, desired_salary: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="linkedin_url">LinkedIn Profile</Label>
                    <Input
                      id="linkedin_url"
                      type="url"
                      placeholder="https://linkedin.com/in/..."
                      value={formData.linkedin_url}
                      onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resume">Resume</Label>
                  <div className="flex items-center gap-3">
                    {officerProfile?.resume_url && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleResumeOpen}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        View Current Resume
                      </Button>
                    )}
                    <Input
                      id="resume"
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={handleResumeUpload}
                      disabled={uploadingResume}
                      className="hidden"
                    />
                    <label htmlFor="resume">
                      <Button 
                        type="button" 
                        variant={officerProfile?.resume_url ? "secondary" : "outline"}
                        size="sm"
                        disabled={uploadingResume}
                        asChild
                      >
                        <span className="cursor-pointer">
                          <Upload className="mr-2 h-4 w-4" />
                          {uploadingResume ? "Uploading..." : officerProfile?.resume_url ? "Replace Resume" : "Upload Resume"}
                        </span>
                      </Button>
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">PDF, DOC, or DOCX format</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">Professional Bio</Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell companies about your experience, specializations, and what makes you an excellent security professional..."
                    rows={6}
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  />
                </div>

                <div className="sticky bottom-0 z-20 -mx-6 flex justify-end border-t bg-background/95 px-6 py-4 backdrop-blur"><Button type="submit" className="h-12 w-full text-base sm:w-auto" disabled={loading}>{loading ? "Saving..." : "Save Profile"}</Button></div>
                </form>
              </CardContent>
            </Card>
            )}

            {activeTab === "availability" && (
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Weekly Availability
              </CardTitle>
              <CardDescription>
                Set your available hours for each day of the week
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Quick Set Actions */}
                <div className="p-4 border rounded-lg space-y-4 bg-muted/30">
                  <h3 className="font-semibold text-sm">Quick Actions</h3>
                  
                  {/* Set All Days */}
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-2">
                      <Label htmlFor="quick-start" className="text-xs">Start Time</Label>
                      <Input
                        id="quick-start"
                        type="time"
                        value={quickSetStart}
                        onChange={(e) => setQuickSetStart(e.target.value)}
                        className="w-32"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quick-end" className="text-xs">End Time</Label>
                      <Input
                        id="quick-end"
                        type="time"
                        value={quickSetEnd}
                        onChange={(e) => setQuickSetEnd(e.target.value)}
                        className="w-32"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (quickSetStart && quickSetEnd) {
                          const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                          const newSchedule: Record<string, { start: string; end: string }> = {};
                          allDays.forEach(day => {
                            newSchedule[day] = { start: quickSetStart, end: quickSetEnd };
                          });
                          setFormData({ ...formData, availability_schedule: newSchedule });
                          toast.success("Applied schedule to all days");
                        } else {
                          toast.error("Please set both start and end times");
                        }
                      }}
                    >
                      Set All Days
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                        const newSchedule: Record<string, { start: string; end: string }> = {};
                        allDays.forEach(day => {
                          newSchedule[day] = { start: "00:00", end: "23:59" };
                        });
                        setFormData({ ...formData, availability_schedule: newSchedule });
                        toast.success("Set to available any time");
                      }}
                    >
                      Available Any Time
                    </Button>
                  </div>

                  {/* Shift Preference */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Preferred Shift</Label>
                    <div className="flex flex-wrap gap-4">
                      {[
                        { value: "first_shift", label: "First Shift (Day)" },
                        { value: "second_shift", label: "Second Shift (Evening)" },
                        { value: "third_shift", label: "Third Shift (Night)" },
                        { value: "weekend", label: "Weekends" }
                      ].map((shift) => (
                        <div key={shift.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={shift.value}
                            checked={formData.shift_preference.includes(shift.value)}
                            onCheckedChange={(checked) => {
                              setFormData({
                                ...formData,
                                shift_preference: checked
                                  ? [...formData.shift_preference, shift.value]
                                  : formData.shift_preference.filter((s) => s !== shift.value),
                              });
                            }}
                          />
                          <Label htmlFor={shift.value} className="cursor-pointer text-sm">{shift.label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Employment Type Preference */}
                  <div className="space-y-3">
                    <Label className="text-sm font-semibold">Employment Type Preference</Label>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="full-time"
                          checked={formData.employment_type.includes("full_time")}
                          onCheckedChange={(checked) => {
                            setFormData({
                              ...formData,
                              employment_type: checked
                                ? [...formData.employment_type, "full_time"]
                                : formData.employment_type.filter((t) => t !== "full_time"),
                            });
                          }}
                        />
                        <Label htmlFor="full-time" className="cursor-pointer text-sm">Full-time</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="part-time"
                          checked={formData.employment_type.includes("part_time")}
                          onCheckedChange={(checked) => {
                            setFormData({
                              ...formData,
                              employment_type: checked
                                ? [...formData.employment_type, "part_time"]
                                : formData.employment_type.filter((t) => t !== "part_time"),
                            });
                          }}
                        />
                        <Label htmlFor="part-time" className="cursor-pointer text-sm">Part-time</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="seasonal"
                          checked={formData.employment_type.includes("seasonal")}
                          onCheckedChange={(checked) => {
                            setFormData({
                              ...formData,
                              employment_type: checked
                                ? [...formData.employment_type, "seasonal"]
                                : formData.employment_type.filter((t) => t !== "seasonal"),
                            });
                          }}
                        />
                        <Label htmlFor="seasonal" className="cursor-pointer text-sm">Seasonal</Label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Weekly Schedule */}
                <div className="space-y-4">
                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                  <div key={day} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center pb-4 border-b last:border-0">
                    <Label className="font-semibold">{day}</Label>
                    <div className="space-y-2">
                      <Label htmlFor={`${day}-start`} className="text-sm text-muted-foreground">Start Time</Label>
                      <Input
                        id={`${day}-start`}
                        type="time"
                        value={formData.availability_schedule[day]?.start || ""}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            availability_schedule: {
                              ...formData.availability_schedule,
                              [day]: {
                                ...formData.availability_schedule[day],
                                start: e.target.value,
                              },
                            },
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${day}-end`} className="text-sm text-muted-foreground">End Time</Label>
                      <Input
                        id={`${day}-end`}
                        type="time"
                        value={formData.availability_schedule[day]?.end || ""}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            availability_schedule: {
                              ...formData.availability_schedule,
                              [day]: {
                                ...formData.availability_schedule[day],
                                end: e.target.value,
                              },
                            },
                          });
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newSchedule = { ...formData.availability_schedule };
                        delete newSchedule[day];
                        setFormData({
                          ...formData,
                          availability_schedule: newSchedule,
                        });
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                ))}
                  <div className="sticky bottom-0 z-20 -mx-6 flex justify-end border-t bg-background/95 px-6 py-4 backdrop-blur"><Button className="h-12 w-full text-base sm:w-auto" onClick={handleSubmit} disabled={loading}>{loading ? "Saving..." : "Save Availability"}</Button></div>
                </div>
                </div>
              </CardContent>
            </Card>
            )}

            {activeTab === "photos" && (
              <OfficerPhotos userId={userId} onChanged={loadProfile} />
            )}

            {activeTab === "certifications" && (
            <CertificationsManager 
              officerId={officerProfile?.id || ""} 
              userId={userId}
              onEnsureProfile={ensureOfficerProfile}
              onChanged={loadProfile}
            />
            )}

            {activeTab === "work-history" && (
            <WorkHistory 
              officerId={officerProfile?.id || ""} 
              userId={userId}
              onEnsureProfile={ensureOfficerProfile}
              onChanged={loadProfile}
            />
            )}

            {activeTab === "videos" && (
              <VideoInterviewsManager
                officerId={officerProfile?.id || ""}
                userId={userId}
                onChanged={loadProfile}
              />
            )}

            {activeTab === "interview-history" && (
              <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" />Interview History</CardTitle>
                  <CardDescription>Your past interviews remain here whether or not the position resulted in a hire.</CardDescription>
                </CardHeader>
                <CardContent>
                  {interviewHistory.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Your completed interviews will appear here after the scheduled day ends.</div>
                  ) : (
                    <div className="grid gap-3">
                      {interviewHistory.map((interview) => {
                        const confirmedCompany = String(completedOnboardingRecord?.company_name || "").trim().toLocaleLowerCase();
                        const interviewCompany = String(interview.company_name || "").trim().toLocaleLowerCase();
                        const resultedInConfirmedHire = Boolean(
                          employmentConfirmedAt &&
                          confirmedCompany &&
                          interviewCompany === confirmedCompany
                        );
                        const responseLabel = interview.status === "cancelled" ? "Canceled" : interview.response_status === "declined" ? "Declined" : interview.attendance_status === "no_show" ? "No-show" : resultedInConfirmedHire ? "Completed — hired" : interview.attendance_status === "attended" ? "Attended" : interview.response_status === "accepted" ? "Awaiting company confirmation" : "No response recorded";
                        return <div key={interview.id} className="rounded-xl border bg-card p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="font-semibold">{interview.company_name || "Company"} — {interview.job_title || "Security Officer"}</p>
                              <p className="mt-1 text-sm text-muted-foreground">{new Date(interview.scheduled_at).toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</p>
                              <p className="mt-2 flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0" />{interview.interview_type === "video" ? "Online interview" : interview.location || "In-person interview"}</p>
                            </div>
                            <Badge variant={responseLabel === "Attended" || responseLabel === "Completed — hired" ? "default" : responseLabel === "No-show" ? "destructive" : "secondary"}>{responseLabel}</Badge>
                          </div>
                        </div>;
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === "hiring-application" && (
              employeeOnboardingSubmitted ? (
                <Card className="mx-auto max-w-3xl rounded-2xl border-green-200 bg-gradient-to-r from-green-50 via-emerald-50/70 to-background shadow-sm">
                  <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:text-left">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-600 text-white shadow-sm">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-green-700">Completed and received</p>
                      <h2 className="mt-1 text-2xl font-bold text-foreground">Your application process is complete</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Your hiring application and completed onboarding packet were received by {completedCompanyName}
                        {completedOnboardingRecord?.submitted_at ? ` on ${new Date(completedOnboardingRecord.submitted_at).toLocaleDateString()}` : ""}. No additional submission is needed.
                      </p>
                    </div>
                    <Badge className="shrink-0 border border-green-200 bg-green-100 text-green-800 hover:bg-green-100">Complete</Badge>
                  </CardContent>
                </Card>
              ) : applicationSubmitted ? (
                <Card className="mx-auto max-w-3xl rounded-2xl border-green-200 bg-gradient-to-r from-green-50 via-emerald-50/70 to-background shadow-sm">
                  <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:flex-row sm:text-left">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-green-600 text-white shadow-sm">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-green-700">Application submitted</p>
                      <h2 className="mt-1 text-2xl font-bold text-foreground">Thank you—your hiring application was received</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Your application has been sent to the hiring company and is saved. You do not need to submit it again. The company will contact you about the next step.
                      </p>
                    </div>
                    <Badge className="shrink-0 border border-green-200 bg-green-100 text-green-800 hover:bg-green-100">Submitted</Badge>
                  </CardContent>
                </Card>
              ) : (
                <GuardHiringApplication
                  userId={userId}
                  officerId={officerProfile?.id || null}
                  onEnsureProfile={ensureOfficerProfile}
                  onChanged={loadProfile}
                />
              )
            )}

            {activeTab === "employee-onboarding" && onboardingOfferLoaded && !onboardingOfferAvailable && (
              <Card className="mx-auto max-w-2xl rounded-2xl border-amber-200 bg-amber-50">
                <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                  <div className="rounded-2xl bg-amber-100 p-4 text-amber-800"><LockKeyhole className="h-8 w-8" /></div>
                  <div><h2 className="text-2xl font-bold">Employee onboarding is locked</h2><p className="mt-2 text-amber-950/75">A company must send you a completed offer with pay and assignment details before these forms become available.</p></div>
                  <Button type="button" onClick={() => handleTabChange("hiring-application")}>View hiring application</Button>
                </CardContent>
              </Card>
            )}

            {activeTab === "employee-onboarding" && pendingEmploymentOffer && (
              <OfficerOfferReview offer={pendingEmploymentOffer} officerName={profile?.full_name || ""} onChanged={loadProfile} />
            )}

            {activeTab === "employee-onboarding" && !pendingEmploymentOffer && (!onboardingOfferLoaded || onboardingOfferAvailable) && (
              <OfficerEmployeeOnboarding
                userId={userId}
                officerId={officerProfile?.id || null}
                onEnsureProfile={ensureOfficerProfile}
                onChanged={loadProfile}
              />
            )}

            {activeTab === "find-jobs" && (
              <JobSearch officerId={officerProfile?.id || null} />
            )}

            {activeTab === "messages" && (
              <OfficerMessages 
                officerId={officerProfile?.id || ""} 
                officerName={profile?.full_name || profile?.email || "Officer"}
              />
            )}

            {activeTab === "account" && (
              <AccountSettings userId={userId} onProfileUpdated={(nextProfile) => setProfile((current: any) => ({ ...current, ...nextProfile }))} />
            )}
          </div>
          </div>
          
          {/* Right Side Chat Panel and Interested Jobs */}
          {officerProfile?.id && activeTab !== "employee-onboarding" && (
            <div className="hidden w-96 shrink-0 border-l bg-muted/20 p-4 overflow-y-auto space-y-4 xl:block">
              {!employmentConfirmedAt && !onboardingComplete && activeTab !== "hiring-application" && onboardingChecklist(true)}
              <div className="h-[250px]">
                <OfficerChatPanel 
                  officerId={officerProfile.id} 
                  officerName={profile?.full_name || profile?.email || "Officer"}
                />
              </div>
              <InterestedJobsPanel 
                officerId={officerProfile.id} 
                officerName={profile?.full_name || profile?.email || "Officer"}
              />
            </div>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
};

export default OfficerDashboard;
