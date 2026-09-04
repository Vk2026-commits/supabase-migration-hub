import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { AlertTriangle, Award, Video, User, Briefcase, Clock, Upload, FileText, GraduationCap, Info, CheckCircle2, Circle, ClipboardCheck } from "lucide-react";
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

interface OfficerDashboardProps {
  userId: string;
  initialTab?: string;
}

const guidedSections: Record<string, { title: string; description: string; step: number }> = {
  profile: { title: "Your professional profile", description: "Keep your contact details and professional introduction current.", step: 2 },
  availability: { title: "Your availability", description: "Choose the work types, shifts, and weekly hours employers can rely on.", step: 3 },
  photos: { title: "Your professional photos", description: "Manage the same private photos included with your hiring application.", step: 4 },
  certifications: { title: "Licenses and certifications", description: "Manage the same secure documents included with your hiring application.", step: 5 },
  "work-history": { title: "Your work history", description: "Review or update the experience saved from your hiring application.", step: 6 },
};

function GuidedSectionHeader({ section, completed }: { section: { title: string; description: string; step: number }; completed: boolean }) {
  return <div className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
    <div className="flex items-center gap-4 px-5 py-5 sm:px-8 sm:py-7">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">{section.step}</div>
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">Officer onboarding record</p><h1 className="text-2xl font-bold sm:text-3xl">{section.title}</h1><p className="mt-1 text-sm text-muted-foreground sm:text-base">{section.description}</p></div>
      <span className={`hidden rounded-full px-3 py-1 text-xs font-semibold sm:block ${completed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>{completed ? "Complete" : "Needs attention"}</span>
    </div>
    <div className="h-2 bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round((section.step / 6) * 100)}%` }} /></div>
  </div>;
}

const getPrivateFilePath = (value: string | null | undefined, bucket: string) => {
  if (!value) return null;

  const bucketMarker = `/${bucket}/`;
  const markerIndex = value.indexOf(bucketMarker);
  const path = markerIndex >= 0 ? value.slice(markerIndex + bucketMarker.length) : value;

  return decodeURIComponent(path.split("?")[0]);
};

const OfficerDashboard = ({ userId, initialTab = "profile" }: OfficerDashboardProps) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const dashboardTopRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    loadProfile();
  }, [userId]);

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
        phone: data.phone || "",
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
        const [certsResult, trainingsResult, workResult, videosResult, applicationResult, photosResult, employeeOnboardingResult] = await Promise.all([
          supabase.from("certifications").select("id,document_front_url", { count: 'exact' }).eq("officer_id", data.id).neq("certification_type", "training"),
          supabase.from("certifications").select("id", { count: 'exact' }).eq("officer_id", data.id).eq("certification_type", "training"),
          supabase.from("work_history").select("id", { count: 'exact' }).eq("officer_id", data.id),
          supabase.from("video_interviews").select("id", { count: 'exact', head: true }).eq("officer_id", data.id),
          (supabase as any).from("guard_hiring_applications").select("status").eq("officer_id", data.id).eq("application_type", "master").maybeSingle(),
          supabase.storage.from("officer-photos").list(userId, { limit: 100 }),
          (supabase as any).from("officer_onboarding_packets").select("status").eq("officer_id", data.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        ]);
        
        setCertCount(certsResult.count || 0);
        setTrainingCount(trainingsResult.count || 0);
        setWorkHistoryCount(workResult.count || 0);
        setVideoInterviewCount(videosResult.count || 0);
        setCertificationDocumentComplete((certsResult.data || []).some((cert: any) => Boolean(cert.document_front_url)));
        setApplicationSubmitted(applicationResult.data?.status === "submitted");
        setEmployeeOnboardingSubmitted(employeeOnboardingResult.data?.status === "submitted");
        const photoNames = (photosResult.data || []).map((file: any) => file.name.split(".")[0]);
        setPhotoCount(photoNames.length);
        setRequiredPhotosComplete(photoNames.includes("headshot") && photoNames.includes("full-body"));
        if (!choseInitialExperience.current) {
          choseInitialExperience.current = true;
          if (initialTab === "profile" && applicationResult.data?.status !== "submitted") setActiveTab("hiring-application");
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

      toast.success("Profile updated successfully!");
      loadProfile();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate completion status for each tab
  const completionStatus = {
    profile: !!(officerProfile?.title && officerProfile?.bio && officerProfile?.phone && 
                officerProfile?.address_city && officerProfile?.address_state),
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
    { label: "Complete employee onboarding after hire", complete: employeeOnboardingSubmitted, tab: "employee-onboarding" },
    { label: "Set availability", complete: completionStatus.availability, tab: "availability" },
    { label: "Add headshot and full-body photo", complete: requiredPhotosComplete, tab: "photos" },
    { label: "Upload a certification front document", complete: certificationDocumentComplete, tab: "certifications" },
  ];
  const onboardingComplete = onboardingItems.every((item) => item.complete);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      dashboardTopRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  };

  return (
    <SidebarProvider>
      <div ref={dashboardTopRef} className="flex w-full min-h-screen scroll-mt-0">
        <OfficerSidebar 
          activeTab={activeTab} 
          onTabChange={handleTabChange}
          completionStatus={completionStatus}
        />
        <div className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
            <div className="mb-4">
              <SidebarTrigger />
            </div>
            <h1 className={`text-2xl font-bold mb-4 sm:text-3xl ${activeTab === "hiring-application" || activeTab === "employee-onboarding" || guidedSections[activeTab] ? "sr-only" : ""}`}>
              Welcome, {profile?.full_name || profile?.email}
            </h1>

            {guidedSections[activeTab] && <GuidedSectionHeader section={guidedSections[activeTab]} completed={Boolean(completionStatus[activeTab === "work-history" ? "workHistory" : activeTab as keyof typeof completionStatus])} />}

            {!onboardingComplete && activeTab !== "hiring-application" && (
              <Card className="mb-6 rounded-2xl border-primary/20 bg-primary/5">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-primary" />Finish your onboarding</CardTitle><CardDescription>You can use the dashboard now. Complete these items so employers can review your profile.</CardDescription></CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">{onboardingItems.map((item) => <button key={item.label} type="button" onClick={() => handleTabChange(item.tab)} className="flex items-center gap-3 rounded-xl border bg-background p-3 text-left transition-colors hover:bg-muted">{item.complete ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}<span className={item.complete ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{item.label}</span></button>)}</CardContent>
              </Card>
            )}

            {activeTab === "profile" && (
              <Alert className="mb-6 border-primary/20 bg-primary/5">
                <Info className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  <strong>Stand out to employers!</strong> Complete your profile with detailed information, 
                  upload a professional headshot and full-body photo, and showcase your certifications. 
                  A complete profile significantly increases your chances of being hired.
                </AlertDescription>
              </Alert>
            )}

          <div className="mx-auto max-w-6xl space-y-6 [&_input]:min-h-12 [&_textarea]:text-base [&_[role=combobox]]:min-h-12">
            {activeTab === "profile" && (
              <div className="grid md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex h-[4.5rem] flex-row items-start justify-between space-y-0 py-2">
            <CardTitle className="text-sm font-medium leading-tight">Profile</CardTitle>
            <User className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="whitespace-nowrap text-xl font-bold">
              {officerProfile ? "Complete" : "Incomplete"}
            </div>
            <p className="text-xs text-muted-foreground">
              {officerProfile ? "Your profile is live" : "Complete your profile to get started"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex h-[4.5rem] flex-row items-start justify-between space-y-0 py-2">
            <CardTitle className="text-sm font-medium leading-tight">Certifications and Certificates</CardTitle>
            <Award className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{certCount}</div>
            <p className="text-xs text-muted-foreground">Add your certifications and certificates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex h-[4.5rem] flex-row items-start justify-between space-y-0 py-2">
            <CardTitle className="text-sm font-medium leading-tight">Trainings</CardTitle>
            <GraduationCap className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{trainingCount}</div>
            <p className="text-xs text-muted-foreground">Add your training certificates</p>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors hover:bg-accent/50 ${urgentExpiring ? "border-destructive/50" : ""}`}
          onClick={() => handleTabChange("certifications")}
        >
          <CardHeader className="flex h-[4.5rem] flex-row items-start justify-between space-y-0 py-2">
            <CardTitle className="text-sm font-medium leading-tight">Expiring Skills</CardTitle>
            <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${urgentExpiring ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${urgentExpiring ? "text-destructive" : ""}`}>
              {expiringItems.length}
            </div>
            <p className={`text-xs ${urgentExpiring ? "text-destructive" : "text-muted-foreground"}`}>
              {expiringItems.length === 0
                ? "No credentials expiring soon"
                : urgentExpiring
                  ? "Expiring within 30 days"
                  : "Expiring within 90 days"}
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:bg-accent/50"
          onClick={() => handleTabChange("videos")}
        >
          <CardHeader className="flex h-[4.5rem] flex-row items-start justify-between space-y-0 py-2">
            <CardTitle className="text-sm font-medium leading-tight">Video Interviews</CardTitle>
            <Video className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{videoInterviewCount}</div>
            <p className="text-xs text-muted-foreground">
              {videoInterviewCount === 0 ? "Upload your interview" : "Manage your interviews"}
            </p>
          </CardContent>
        </Card>
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
                      placeholder="+1 (555) 000-0000"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
            />
            )}

            {activeTab === "videos" && (
              <VideoInterviewsManager
                officerId={officerProfile?.id || ""}
                userId={userId}
                onChanged={loadProfile}
              />
            )}

            {activeTab === "hiring-application" && (
              <GuardHiringApplication
                userId={userId}
                officerId={officerProfile?.id || null}
                onEnsureProfile={ensureOfficerProfile}
                onChanged={loadProfile}
              />
            )}

            {activeTab === "employee-onboarding" && (
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
          </div>
          </div>
          
          {/* Right Side Chat Panel and Interested Jobs */}
          {officerProfile?.id && (
            <div className="hidden w-96 shrink-0 border-l bg-muted/20 p-4 overflow-y-auto space-y-4 xl:block">
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
