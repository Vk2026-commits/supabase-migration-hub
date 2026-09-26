import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, BellRing, Briefcase, Building2, CreditCard, Crown, Heart, MapPinned, Settings, UserCheck, UserX, Users, UsersRound, Upload, type LucideIcon } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SidebarProvider } from "@/components/ui/sidebar";
import { CompanySidebar } from "./CompanySidebar";
import EmploymentTracking from "./EmploymentTracking";
import NotHiredTracking from "./NotHiredTracking";
import InterestedOfficers from "./InterestedOfficers";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import JobPostings from "./JobPostings";
import JobApplicants from "./JobApplicants";
import JobApplicationsList from "./JobApplicationsList";
import SubscriptionManager from "./SubscriptionManager";
import { useSearchParams } from "@/lib/router-compat";
import { useExpiringCredentials } from "@/hooks/useExpiringCredentials";
import { CompanyProfileWizard, type CompanyProfileForm } from "./CompanyProfileWizard";
import CompanyTeam from "./CompanyTeam";
import ClientSites from "./ClientSites";
import { AccountSettings } from "./AccountSettings";
import { WorkspaceIdentityHeader } from "./WorkspaceIdentityHeader";
import { DashboardSectionHeader } from "./DashboardSectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadCompanyWorkspaces,
  selectCompanyWorkspace,
  type CompanyProfile,
  type CompanyWorkspace,
} from "@/lib/company-workspaces";

interface CompanyDashboardProps {
  userId: string;
  userName: string;
}

const companyTabs = new Set([
  "overview",
  "profile",
  "jobs",
  "sites",
  "applicants",
  "interested",
  "employment",
  "not-hired",
  "team",
  "subscriptions",
  "account",
]);

const companySectionDetails: Record<string, { title: string; description: string; icon: LucideIcon }> = {
  profile: { title: "Company profile", description: "Keep your company and hiring-contact information current.", icon: Building2 },
  jobs: { title: "Job postings", description: "Create and manage open security positions.", icon: Briefcase },
  sites: { title: "Client sites", description: "Manage client locations, addresses, and shift details.", icon: MapPinned },
  applicants: { title: "Applicants", description: "Review applications and move candidates through hiring.", icon: UserCheck },
  interested: { title: "Interested officers", description: "Review officers who expressed interest in your jobs.", icon: Heart },
  employment: { title: "Hired officers", description: "Access employee records, documents, and evaluations.", icon: Users },
  "not-hired": { title: "Not Hired", description: "Review closed pending hires and retained decision history.", icon: UserX },
  team: { title: "Company team", description: "Manage staff access and hiring permissions.", icon: UsersRound },
  subscriptions: { title: "Subscription", description: "Review your plan, features, and account access.", icon: CreditCard },
  account: { title: "Account settings", description: "Update your name, username, profile picture, or password.", icon: Settings },
};

// These sections already render a title alongside their own counts/actions.
const sectionsWithOwnHeading = new Set(["jobs", "sites", "not-hired", "team", "subscriptions"]);

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const CompanyDashboard = ({ userId, userName }: CompanyDashboardProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedCompanyId = searchParams.get("companyId");
  const requestedOfficerId = searchParams.get("officerId");
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [companyWorkspaces, setCompanyWorkspaces] = useState<CompanyWorkspace[]>([]);
  const [companyTeamRole, setCompanyTeamRole] = useState<string | null>(null);
  const [accountProfile, setAccountProfile] = useState<any>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [pendingOnboardingReviews, setPendingOnboardingReviews] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(
    requestedTab && companyTabs.has(requestedTab) ? requestedTab : "overview",
  );
  const sectionHeaderRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState<CompanyProfileForm>({
    company_name: "",
    company_address: "",
    company_address_unit: "",
    company_city: "",
    company_state: "",
    company_zip: "",
    industry: "",
    company_size: "",
    website_url: "",
    linkedin_url: "",
    facebook_url: "",
    twitter_url: "",
    instagram_url: "",
    contact_person_name: "",
    contact_person_title: "",
    contact_person_position: "",
    company_phone: "",
    company_phone_ext: "",
    contact_cell_phone: "",
    contact_email: "",
    license_number: "",
    licensed_states: [] as string[],
    license_types: [] as string[],
    years_in_business: "",
    year_founded: "",
    logo_url: "",
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const expiringItems = useExpiringCredentials(userId, "company");
  const urgentExpiring = expiringItems.some((item) => item.daysLeft <= 30);
  const showLegacyProfile = import.meta.env.VITE_SHOW_LEGACY_PROFILE === "true";
  const companyProfileComplete = Boolean(
    companyProfile &&
    companyProfile.company_name?.trim() &&
    companyProfile.company_address?.trim() &&
    companyProfile.company_city?.trim() &&
    companyProfile.company_state?.trim() &&
    companyProfile.company_zip?.trim() &&
    companyProfile.contact_person_name?.trim() &&
    companyProfile.contact_email?.trim() &&
    companyProfile.contact_cell_phone?.trim(),
  );

  const selectTab = (tab: string) => {
    if (!companyProfileComplete && tab !== "overview" && tab !== "profile" && tab !== "subscriptions" && tab !== "account") {
      toast.error(
        "Complete your company profile, including your hiring contact mobile number, before using the hiring workspace",
      );
      setActiveTab("profile");
      const profileParams = new URLSearchParams(searchParams);
      profileParams.set("tab", "profile");
      setSearchParams(profileParams);
      return;
    }
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", tab);
    nextParams.delete("officerId");
    nextParams.delete("officerSource");
    setSearchParams(nextParams);
  };

  const openOfficerRecord = (officerId: string, source: "applicants" | "employment") => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", source);
    nextParams.set("officerId", officerId);
    nextParams.set("officerSource", source);
    setSearchParams(nextParams);
  };

  const closeOfficerRecord = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("officerId");
    nextParams.delete("officerSource");
    setSearchParams(nextParams);
  };

  useEffect(() => {
    const nextTab = requestedTab && companyTabs.has(requestedTab) ? requestedTab : "overview";
    setActiveTab((current) => current === nextTab ? current : nextTab);
  }, [requestedTab]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (activeTab === "overview") {
        document.getElementById("company-dashboard-content")?.scrollIntoView({ behavior: "auto", block: "start" });
        return;
      }
      sectionHeaderRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      sectionHeaderRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab]);

  const loadProfile = useCallback(async () => {
    setProfileLoaded(false);
    try {
      const availableWorkspaces = await loadCompanyWorkspaces(userId);
      const selectedWorkspace = selectCompanyWorkspace(availableWorkspaces, requestedCompanyId);
      const data = selectedWorkspace?.company || null;
      setCompanyWorkspaces(availableWorkspaces);
      setCompanyTeamRole(selectedWorkspace?.role || null);
      setCompanyProfile(data);

      if (data && requestedCompanyId !== data.id) {
        const nextParams = new URLSearchParams(window.location.search);
        nextParams.set("companyId", data.id);
        setSearchParams(nextParams, { replace: true });
      }

      if (!data) return;
      setFormData({
        company_name: data.company_name || "",
        company_address: data.company_address || "",
        company_address_unit: data.company_address_unit || "",
        company_city: data.company_city || "",
        company_state: data.company_state || "",
        company_zip: data.company_zip || "",
        industry: data.industry || "",
        company_size: data.company_size || "",
        website_url: data.website_url || "",
        linkedin_url: data.linkedin_url || "",
        facebook_url: data.facebook_url || "",
        twitter_url: data.twitter_url || "",
        instagram_url: data.instagram_url || "",
        contact_person_name: data.contact_person_name || "",
        contact_person_title: data.contact_person_title || "",
        contact_person_position: data.contact_person_position || "",
        company_phone: data.company_phone || "",
        company_phone_ext: data.company_phone_ext || "",
        contact_cell_phone: data.contact_cell_phone || "",
        contact_email: data.contact_email || "",
        license_number: data.license_number || "",
        licensed_states: data.licensed_states || [],
        license_types: data.license_types || [],
        years_in_business: data.years_in_business || "",
        year_founded: data.year_founded?.toString() || "",
        logo_url: data.logo_url || "",
      });
    } catch (error) {
      console.error("Failed to load company workspaces", error);
      toast.error(errorMessage(error, "Company workspaces could not be loaded"));
      setCompanyProfile(null);
      setCompanyWorkspaces([]);
      setCompanyTeamRole(null);
    } finally {
      setProfileLoaded(true);
    }
  }, [requestedCompanyId, setSearchParams, userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const switchCompanyWorkspace = (companyId: string) => {
    if (companyId === companyProfile?.id) return;
    setProfileLoaded(false);
    setCompanyProfile(null);
    setPendingOnboardingReviews(0);
    setActiveTab("overview");
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("companyId", companyId);
    nextParams.set("tab", "overview");
    setSearchParams(nextParams);
  };

  useEffect(() => {
    if (!companyProfile?.id) return;

    const loadPendingReviews = async () => {
      const { data, error } = await (supabase as any).rpc("get_company_pending_onboarding_reviews", {
        _company_id: companyProfile.id,
      });
      if (error) {
        if (error.code !== "42883") console.error("Failed to load pending onboarding reviews", error);
        return;
      }
      setPendingOnboardingReviews(Array.isArray(data) ? data.length : 0);
    };

    void loadPendingReviews();
    const refresh = window.setInterval(() => void loadPendingReviews(), 15000);
    return () => window.clearInterval(refresh);
  }, [companyProfile?.id]);

  useEffect(() => {
    void supabase.from("profiles").select("email,full_name,username,avatar_url,role").eq("id", userId).maybeSingle().then(({ data }) => setAccountProfile(data));
  }, [userId]);

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("company-logos").getPublicUrl(fileName);

      setFormData((current) => ({ ...current, logo_url: publicUrl }));
      toast.success("Logo uploaded successfully!");
      return publicUrl;
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, showToast = true) => {
    e?.preventDefault();
    setLoading(true);

    try {
      // Upload logo if a new file was selected
      let logoUrl = formData.logo_url;
      if (logoFile) {
        logoUrl = await handleLogoUpload(logoFile);
        setLogoFile(null);
      }

      const profileData = {
        ...formData,
        logo_url: logoUrl,
        year_founded: formData.year_founded ? parseInt(formData.year_founded) : null,
      };

      if (companyProfile) {
        const { error } = await supabase
          .from("company_profiles")
          .update(profileData)
          .eq("id", companyProfile.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("company_profiles").insert({
          ...profileData,
          user_id: userId,
        });

        if (error) throw error;
      }

      if (showToast) toast.success("Company profile updated successfully!");
      await loadProfile();
      return true;
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Company profile could not be saved"));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getTierBadge = (tier?: string | null) => {
    const variants: Record<string, { variant: BadgeProps["variant"]; icon: LucideIcon | null }> = {
      free: { variant: "secondary", icon: null },
      professional: { variant: "default", icon: Users },
      premium: { variant: "default", icon: Crown },
    };

    const normalizedTier = tier || "free";
    const config = variants[normalizedTier] || variants.free;
    const Icon = config.icon;

    return (
      <Badge
        variant={config.variant}
        className={normalizedTier === "premium" ? "bg-accent text-accent-foreground" : ""}
      >
        {Icon && <Icon className="h-3 w-3 mr-1" />}
        {normalizedTier.charAt(0).toUpperCase() + normalizedTier.slice(1)}
      </Badge>
    );
  };

  return (
    <SidebarProvider>
      <div className="operations-workspace flex min-h-[calc(100vh-4rem)] w-full bg-slate-50/40">
        <CompanySidebar
          activeTab={activeTab}
          onTabChange={selectTab}
          profileComplete={companyProfileComplete}
          pendingOnboardingReviews={pendingOnboardingReviews}
          companyId={companyProfile?.id || requestedCompanyId || undefined}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <WorkspaceIdentityHeader name={accountProfile?.full_name || userName} email={accountProfile?.email} avatarUrl={accountProfile?.avatar_url} subtitle={formData.company_name || "Company representative"} onOpenAccount={() => selectTab("account")}>
              {companyWorkspaces.length > 1 && companyProfile && (
                <div className="min-w-0 basis-full sm:ml-auto sm:w-full sm:max-w-[280px] sm:basis-auto">
                  <label htmlFor="company-workspace" className="sr-only">Company workspace</label>
                  <Select value={companyProfile.id} onValueChange={switchCompanyWorkspace}>
                    <SelectTrigger id="company-workspace" className="min-w-0 bg-background text-foreground" aria-label="Switch company workspace">
                      <Building2 className="mr-2 h-4 w-4 shrink-0 text-primary" />
                      <SelectValue placeholder="Choose a company" />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {companyWorkspaces.map((workspace) => (
                        <SelectItem key={workspace.company.id} value={workspace.company.id}>
                          {workspace.company.company_name}{workspace.owned ? " (Owner)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
          </WorkspaceIdentityHeader>

          <div
            id="company-dashboard-content"
            ref={sectionsWithOwnHeading.has(activeTab) ? sectionHeaderRef : undefined}
            tabIndex={-1}
            aria-label={companySectionDetails[activeTab]?.title || "Company dashboard"}
            className="w-full scroll-mt-20 space-y-5 overflow-auto p-4 sm:p-5"
          >
            {activeTab !== "overview" && !sectionsWithOwnHeading.has(activeTab) && companySectionDetails[activeTab] && <DashboardSectionHeader key={activeTab} ref={sectionHeaderRef} eyebrow="Company workspace" title={companySectionDetails[activeTab].title} description={companySectionDetails[activeTab].description} icon={companySectionDetails[activeTab].icon} status={companyProfileComplete ? { label: "Company profile complete", tone: "green" } : { label: "Profile setup required", tone: "amber" }} />}
            {activeTab === "overview" && (
              <div className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-5">
                <div className="border-b pb-3"><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Company workspace</p><h2 className="mt-1 text-xl font-bold">Hiring operations</h2><p className="mt-0.5 text-sm text-muted-foreground">Open a work queue to review and act on current records.</p></div>
                {pendingOnboardingReviews > 0 && <button type="button" onClick={() => selectTab("employment")} className="group flex w-full items-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100/70">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700"><BellRing className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-amber-950">{pendingOnboardingReviews} onboarding {pendingOnboardingReviews === 1 ? "packet is" : "packets are"} ready for review</span><span className="mt-0.5 block text-sm text-amber-900/75">Open Hired officers, review the submitted records, and mark onboarding complete.</span></span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-amber-700 transition-transform group-hover:translate-x-1" />
                </button>}
                <div className="overflow-hidden rounded-lg border bg-background">
                  {([
                    ["profile", "Company profile", companyProfileComplete ? "Complete" : "Finish your company details", Building2],
                    ["jobs", "Job postings", "Create and manage open positions", Briefcase],
                    ["sites", "Client sites", "Manage locations, addresses, and shifts", MapPinned],
                    ["applicants", "Applicants", "Review applications and move hiring forward", UserCheck],
                    ["interested", "Interested officers", "See officers interested in your work", Heart],
                    ["employment", "Hired officers", "Access records, documents, and evaluations", Users],
                    ["not-hired", "Not Hired", "Review closed pending hires and decision history", UserX],
                    ["team", "Company team", "Manage staff access and roles", UsersRound],
                    ["subscriptions", "Subscription", companyProfile?.subscription_tier ? `${companyProfile.subscription_tier} plan` : "View plans and access", CreditCard],
                    ["account", "Account settings", "Update your name, username, photo, or password", Settings],
                  ] as const).map(([tab, title, description, Icon]) => <button key={tab} type="button" onClick={() => selectTab(tab)} className="group flex min-h-16 w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1 sm:grid sm:grid-cols-[minmax(180px,0.7fr)_minmax(240px,1.3fr)] sm:items-center sm:gap-4"><span className="block font-semibold">{title}</span><span className="mt-0.5 block text-sm text-muted-foreground sm:mt-0">{description}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </button>)}
                </div>
              </div>
            )}
            {activeTab === "profile" &&
              (profileLoaded ? (
                <div className="space-y-5">
                  <CompanyProfileWizard
                    formData={formData}
                    setFormData={setFormData}
                    logoFile={logoFile}
                    setLogoFile={setLogoFile}
                    loading={loading}
                    uploadingLogo={uploadingLogo}
                    isComplete={companyProfileComplete}
                    onSave={() => handleSubmit(undefined, false)}
                    onBrowse={() => {
                      window.location.href = companyProfile
                        ? `/browse?companyId=${encodeURIComponent(companyProfile.id)}`
                        : "/browse";
                    }}
                    canEdit={companyTeamRole === "owner" || companyTeamRole === "admin"}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                    <p className="text-muted-foreground">Staff access and roles are managed separately under Team.</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => selectTab("team")}>Manage team<ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </div>
                </div>
              ) : (
                <Card className="rounded-2xl" aria-label="Loading company profile"><CardHeader><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-72 max-w-full" /></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardContent></Card>
              ))}
            {showLegacyProfile && activeTab === "profile" && (
              <>
                <div className="grid md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Subscription</CardTitle>
                      <Crown className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {companyProfile && getTierBadge(companyProfile.subscription_tier)}
                        </div>
                        {companyProfile?.subscription_tier === "free" && (
                          <Button size="sm" onClick={() => selectTab("subscriptions")}>
                            Upgrade
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {companyProfile?.subscription_tier === "free" &&
                          "Upgrade for more features"}
                        {companyProfile?.subscription_tier === "professional" &&
                          "Access to direct messaging"}
                        {companyProfile?.subscription_tier === "premium" &&
                          "Full access to all features"}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Company Profile</CardTitle>
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {companyProfile ? "Complete" : "Incomplete"}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {companyProfile ? "Profile is set up" : "Complete your company profile"}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className={urgentExpiring ? "border-destructive/50" : ""}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Expiring Officer Skills</CardTitle>
                      <AlertTriangle
                        className={`h-4 w-4 ${urgentExpiring ? "text-destructive" : "text-muted-foreground"}`}
                      />
                    </CardHeader>
                    <CardContent>
                      <div
                        className={`text-2xl font-bold ${urgentExpiring ? "text-destructive" : ""}`}
                      >
                        {expiringItems.length}
                      </div>
                      <p
                        className={`text-xs ${urgentExpiring ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {expiringItems.length === 0
                          ? "No officer credentials expiring soon"
                          : urgentExpiring
                            ? "Officer credentials expiring within 30 days"
                            : "Officer credentials expiring within 90 days"}
                      </p>
                      {expiringItems.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {expiringItems.slice(0, 3).map((item) => (
                            <li
                              key={item.id}
                              className={`text-xs truncate ${item.daysLeft <= 30 ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {item.officerName ? `${item.officerName} — ` : ""}
                              {item.name} (
                              {item.daysLeft < 0
                                ? "expired"
                                : item.daysLeft === 0
                                  ? "today"
                                  : `${item.daysLeft}d`}
                              )
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Company Information</CardTitle>
                    <CardDescription>Update your company details</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="company_name">Company Name</Label>
                          <Input
                            id="company_name"
                            placeholder="Acme Security Services"
                            value={formData.company_name}
                            onChange={(e) =>
                              setFormData({ ...formData, company_name: e.target.value })
                            }
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="industry">Industry</Label>
                          <Input
                            id="industry"
                            placeholder="Commercial Security"
                            value={formData.industry}
                            onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="company_size">Company Size</Label>
                          <Select
                            value={formData.company_size}
                            onValueChange={(value) =>
                              setFormData({ ...formData, company_size: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select company size" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1-50">1-50 employees</SelectItem>
                              <SelectItem value="50-100">50-100 employees</SelectItem>
                              <SelectItem value="100-200">100-200 employees</SelectItem>
                              <SelectItem value="200-300">200-300 employees</SelectItem>
                              <SelectItem value="300-400">300-400 employees</SelectItem>
                              <SelectItem value="400+">400+ employees</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="years_in_business">Years in Business</Label>
                          <Select
                            value={formData.years_in_business}
                            onValueChange={(value) =>
                              setFormData({ ...formData, years_in_business: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select years in business" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0-1">Less than 1 year</SelectItem>
                              <SelectItem value="1-3">1-3 years</SelectItem>
                              <SelectItem value="3-5">3-5 years</SelectItem>
                              <SelectItem value="5-10">5-10 years</SelectItem>
                              <SelectItem value="10-20">10-20 years</SelectItem>
                              <SelectItem value="20+">20+ years</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="year_founded">Year Founded</Label>
                          <Input
                            id="year_founded"
                            type="number"
                            placeholder="e.g., 2005"
                            min="1800"
                            max={new Date().getFullYear()}
                            value={formData.year_founded}
                            onChange={(e) =>
                              setFormData({ ...formData, year_founded: e.target.value })
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="logo_url">Company Logo</Label>
                          <div className="flex items-center gap-4">
                            {formData.logo_url && (
                              <img
                                src={formData.logo_url}
                                alt="Company Logo"
                                className="h-16 w-16 object-contain rounded border"
                              />
                            )}
                            <Input
                              id="logo_upload"
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setLogoFile(file);
                              }}
                              disabled={uploadingLogo}
                            />
                          </div>
                          {uploadingLogo && (
                            <p className="text-sm text-muted-foreground">Uploading logo...</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-4">Social Media & Website</h3>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="website_url">Website</Label>
                            <Input
                              id="website_url"
                              type="url"
                              placeholder="https://example.com"
                              value={formData.website_url}
                              onChange={(e) =>
                                setFormData({ ...formData, website_url: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="linkedin_url">LinkedIn</Label>
                            <Input
                              id="linkedin_url"
                              type="url"
                              placeholder="https://linkedin.com/company/yourcompany"
                              value={formData.linkedin_url}
                              onChange={(e) =>
                                setFormData({ ...formData, linkedin_url: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="facebook_url">Facebook</Label>
                            <Input
                              id="facebook_url"
                              type="url"
                              placeholder="https://facebook.com/yourcompany"
                              value={formData.facebook_url}
                              onChange={(e) =>
                                setFormData({ ...formData, facebook_url: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="twitter_url">Twitter</Label>
                            <Input
                              id="twitter_url"
                              type="url"
                              placeholder="https://twitter.com/yourcompany"
                              value={formData.twitter_url}
                              onChange={(e) =>
                                setFormData({ ...formData, twitter_url: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="instagram_url">Instagram</Label>
                            <Input
                              id="instagram_url"
                              type="url"
                              placeholder="https://instagram.com/yourcompany"
                              value={formData.instagram_url}
                              onChange={(e) =>
                                setFormData({ ...formData, instagram_url: e.target.value })
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-6">
                        <h3 className="text-lg font-semibold mb-4">Hiring Contact Information</h3>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="contact_person_name">Contact Person Name</Label>
                            <Input
                              id="contact_person_name"
                              placeholder="John Doe"
                              value={formData.contact_person_name}
                              onChange={(e) =>
                                setFormData({ ...formData, contact_person_name: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="contact_person_title">Title</Label>
                            <Input
                              id="contact_person_title"
                              placeholder="HR Manager"
                              value={formData.contact_person_title}
                              onChange={(e) =>
                                setFormData({ ...formData, contact_person_title: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="contact_person_position">Position at Company</Label>
                            <Input
                              id="contact_person_position"
                              placeholder="Director of Operations"
                              value={formData.contact_person_position}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  contact_person_position: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="contact_email">Email Address</Label>
                            <Input
                              id="contact_email"
                              type="email"
                              placeholder="contact@company.com"
                              value={formData.contact_email}
                              onChange={(e) =>
                                setFormData({ ...formData, contact_email: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="company_phone">Company Phone Number</Label>
                            <Input
                              id="company_phone"
                              type="tel"
                              placeholder="(555) 123-4567"
                              value={formData.company_phone}
                              onChange={(e) =>
                                setFormData({ ...formData, company_phone: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="company_phone_ext">Phone Extension</Label>
                            <Input
                              id="company_phone_ext"
                              placeholder="1234"
                              value={formData.company_phone_ext}
                              onChange={(e) =>
                                setFormData({ ...formData, company_phone_ext: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="contact_cell_phone">Cell Phone Number</Label>
                            <Input
                              id="contact_cell_phone"
                              type="tel"
                              placeholder="(555) 987-6543"
                              value={formData.contact_cell_phone}
                              onChange={(e) =>
                                setFormData({ ...formData, contact_cell_phone: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="contact_email">Contact Email</Label>
                            <Input
                              id="contact_email"
                              type="email"
                              placeholder="hiring@company.com"
                              value={formData.contact_email}
                              onChange={(e) =>
                                setFormData({ ...formData, contact_email: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="license_number">Company License Number</Label>
                            <Input
                              id="license_number"
                              placeholder="e.g., A12345"
                              value={formData.license_number}
                              onChange={(e) =>
                                setFormData({ ...formData, license_number: e.target.value })
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="licensed_states">Licensed States</Label>
                            <Input
                              id="licensed_states"
                              placeholder="e.g., TX, CA, FL (comma-separated)"
                              value={formData.licensed_states.join(", ")}
                              onChange={(e) => {
                                const states = e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter((s) => s);
                                setFormData({ ...formData, licensed_states: states });
                              }}
                            />
                            <p className="text-xs text-muted-foreground">
                              Enter state abbreviations separated by commas
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label>Texas Security License Type(s)</Label>
                        <div className="space-y-3 border rounded-lg p-4">
                          <div className="flex items-start space-x-3">
                            <Checkbox
                              id="class-a"
                              checked={formData.license_types.includes("Class A")}
                              onCheckedChange={(checked) => {
                                setFormData({
                                  ...formData,
                                  license_types: checked
                                    ? [...formData.license_types, "Class A"]
                                    : formData.license_types.filter((t) => t !== "Class A"),
                                });
                              }}
                            />
                            <div className="space-y-1">
                              <Label htmlFor="class-a" className="font-semibold cursor-pointer">
                                Class A: Private Investigation Company License
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Authorized to operate as a private investigations company. Limited
                                to investigations, does not include general security contracting.
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-start space-x-3">
                              <Checkbox
                                id="class-b"
                                checked={formData.license_types.includes("Class B")}
                                onCheckedChange={(checked) => {
                                  setFormData({
                                    ...formData,
                                    license_types: checked
                                      ? [...formData.license_types, "Class B"]
                                      : formData.license_types.filter((t) => t !== "Class B"),
                                  });
                                }}
                              />
                              <div className="space-y-1">
                                <Label htmlFor="class-b" className="font-semibold cursor-pointer">
                                  Class B: Security Contractor Company License
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                  Authorized to operate as a security contractor. May include one or
                                  more subcategories:
                                </p>
                              </div>
                            </div>
                            <div className="ml-8 space-y-2 text-sm">
                              {[
                                "Alarm Systems",
                                "Armored Car",
                                "Courier",
                                "Electronic Access",
                                "Guard",
                                "Locksmith",
                              ].map((subtype) => (
                                <div key={subtype} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`class-b-${subtype.toLowerCase().replace(" ", "-")}`}
                                    checked={formData.license_types.includes(
                                      `Class B - ${subtype}`,
                                    )}
                                    onCheckedChange={(checked) => {
                                      setFormData({
                                        ...formData,
                                        license_types: checked
                                          ? [...formData.license_types, `Class B - ${subtype}`]
                                          : formData.license_types.filter(
                                              (t) => t !== `Class B - ${subtype}`,
                                            ),
                                      });
                                    }}
                                  />
                                  <Label
                                    htmlFor={`class-b-${subtype.toLowerCase().replace(" ", "-")}`}
                                    className="cursor-pointer font-normal"
                                  >
                                    {subtype}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-start space-x-3">
                            <Checkbox
                              id="class-c"
                              checked={formData.license_types.includes("Class C")}
                              onCheckedChange={(checked) => {
                                setFormData({
                                  ...formData,
                                  license_types: checked
                                    ? [...formData.license_types, "Class C"]
                                    : formData.license_types.filter((t) => t !== "Class C"),
                                });
                              }}
                            />
                            <div className="space-y-1">
                              <Label htmlFor="class-c" className="font-semibold cursor-pointer">
                                Class C: Investigations and Security Contractor Company License
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Provides both private investigation services and all types of
                                security contractor services covered under Class A and Class B
                                licenses.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <Button type="submit" disabled={loading}>
                        {loading ? "Saving..." : "Save Profile"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Browse Security Officers</CardTitle>
                    <CardDescription>
                      Find qualified security professionals for your needs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild>
                      <a href={companyProfile ? `/browse?companyId=${encodeURIComponent(companyProfile.id)}` : "/browse"}>Browse Professionals</a>
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === "jobs" && companyProfile && (
              <JobPostings companyId={companyProfile.id} />
            )}

            {activeTab === "sites" && companyProfile && (
              <ClientSites
                companyId={companyProfile.id}
                canManage={["owner", "admin", "hiring_manager"].includes(companyTeamRole || "")}
              />
            )}

            {activeTab === "applicants" && companyProfile && (
              <JobApplicants
                companyId={companyProfile.id}
                subscriptionTier={companyProfile.subscription_tier ?? "free"}
                onNavigateToSubscriptions={() => selectTab("subscriptions")}
                selectedOfficerId={requestedOfficerId}
                onOpenOfficer={(officerId) => openOfficerRecord(officerId, "applicants")}
                onCloseOfficer={closeOfficerRecord}
              />
            )}

            {activeTab === "interested" && companyProfile && (
              <Tabs key={companyProfile.id} defaultValue="job-interest" className="space-y-3">
                <TabsList className="h-auto flex-wrap justify-start"><TabsTrigger value="job-interest">Interested in your jobs</TabsTrigger><TabsTrigger value="shortlist">Company shortlist</TabsTrigger></TabsList>
                <TabsContent value="job-interest" className="m-0"><JobApplicationsList companyId={companyProfile.id} onOpenOfficer={(officerId) => openOfficerRecord(officerId, "applicants")} /></TabsContent>
                <TabsContent value="shortlist" className="m-0">
                  <p className="mb-3 text-sm text-muted-foreground">Officers your company saved while browsing. This is separate from responses to your jobs.</p>
                  <InterestedOfficers
                    companyId={companyProfile.id}
                    subscriptionTier={companyProfile.subscription_tier ?? "free"}
                  />
                </TabsContent>
              </Tabs>
            )}

            {activeTab === "employment" && companyProfile && (
              <EmploymentTracking companyId={companyProfile.id} onPendingReviewCountChange={setPendingOnboardingReviews} selectedOfficerId={requestedOfficerId} onOpenOfficer={(officerId) => openOfficerRecord(officerId, "employment")} onCloseOfficer={closeOfficerRecord} />
            )}

            {activeTab === "not-hired" && companyProfile && (
              <NotHiredTracking companyId={companyProfile.id} />
            )}

            {activeTab === "team" && companyProfile && (
              <CompanyTeam
                companyId={companyProfile.id}
                allowInvites={companyTeamRole === "owner" || companyTeamRole === "admin"}
              />
            )}

            {activeTab === "subscriptions" && companyProfile && (
              <SubscriptionManager
                companyId={companyProfile.id}
                currentTier={companyProfile.subscription_tier ?? "free"}
                onUpgrade={(tier) => {
                  toast.success(`Upgrading to ${tier}...`);
                }}
              />
            )}

            {activeTab === "account" && (
              <AccountSettings userId={userId} onProfileUpdated={setAccountProfile} />
            )}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CompanyDashboard;
