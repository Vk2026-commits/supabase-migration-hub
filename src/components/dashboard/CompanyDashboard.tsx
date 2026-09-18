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
import { AlertTriangle, ArrowRight, BellRing, Briefcase, Building2, CreditCard, Crown, Heart, MapPinned, Settings, UserCheck, Users, UsersRound, Upload, type LucideIcon } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { CompanySidebar } from "./CompanySidebar";
import EmploymentTracking from "./EmploymentTracking";
import InterestedOfficers from "./InterestedOfficers";
import JobPostings from "./JobPostings";
import JobApplicants from "./JobApplicants";
import JobApplicationsList from "./JobApplicationsList";
import SubscriptionManager from "./SubscriptionManager";
import { useSearchParams } from "@/lib/router-compat";
import { useExpiringCredentials } from "@/hooks/useExpiringCredentials";
import { CompanyProfileWizard, type CompanyProfileForm } from "./CompanyProfileWizard";
import CompanyTeam from "./CompanyTeam";
import ClientSites from "./ClientSites";
import type { Database } from "@/integrations/supabase/types";
import { AccountSettings } from "./AccountSettings";
import { ProfileAvatar } from "./ProfileAvatar";
import { DashboardSectionHeader } from "./DashboardSectionHeader";
import { Skeleton } from "@/components/ui/skeleton";

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
  "team",
  "subscriptions",
  "account",
]);

type CompanyProfile = Database["public"]["Tables"]["company_profiles"]["Row"];

const companySectionDetails: Record<string, { title: string; description: string; icon: LucideIcon }> = {
  profile: { title: "Company profile", description: "Keep your company and hiring-contact information current.", icon: Building2 },
  jobs: { title: "Job postings", description: "Create and manage open security positions.", icon: Briefcase },
  sites: { title: "Client sites", description: "Manage client locations, addresses, and shift details.", icon: MapPinned },
  applicants: { title: "Applicants", description: "Review applications and move candidates through hiring.", icon: UserCheck },
  interested: { title: "Interested officers", description: "Review officers who expressed interest in your jobs.", icon: Heart },
  employment: { title: "Hired officers", description: "Access employee records, documents, and evaluations.", icon: Users },
  team: { title: "Company team", description: "Manage staff access and hiring permissions.", icon: UsersRound },
  subscriptions: { title: "Subscription", description: "Review your plan, features, and account access.", icon: CreditCard },
  account: { title: "Account settings", description: "Update your name, username, profile picture, or password.", icon: Settings },
};

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const CompanyDashboard = ({ userId, userName }: CompanyDashboardProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
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
    const { data: ownedCompany } = await supabase
      .from("company_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    let data = ownedCompany;
    let teamRole: string | null = ownedCompany ? "owner" : null;
    if (!data) {
      const { data: membership } = await supabase
        .from("company_members")
        .select("company_id,role,status")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (membership?.company_id) {
        const { data: memberCompany } = await supabase
          .from("company_profiles")
          .select("*")
          .eq("id", membership.company_id)
          .maybeSingle();
        data = memberCompany;
        teamRole = membership.role;
      }
    }
    setCompanyTeamRole(teamRole);

    if (data) {
      setCompanyProfile(data);
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
    }
    setProfileLoaded(true);
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

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
        user_id: userId,
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
        const { error } = await supabase.from("company_profiles").insert(profileData);

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
      <div className="flex min-h-[calc(100vh-4rem)] w-full">
        <CompanySidebar
          activeTab={activeTab}
          onTabChange={selectTab}
          profileComplete={companyProfileComplete}
          pendingOnboardingReviews={pendingOnboardingReviews}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <div className="border-b bg-background sticky top-0 z-10">
            <div className="flex h-16 items-center px-4 gap-4">
              <SidebarTrigger />
              <button type="button" onClick={() => selectTab("account")} className="flex min-w-0 items-center gap-3 rounded-xl text-left transition-opacity hover:opacity-80" aria-label="Open account settings">
                <ProfileAvatar name={accountProfile?.full_name || userName} email={accountProfile?.email} src={accountProfile?.avatar_url} className="h-10 w-10" />
                <span className="min-w-0"><span className="block truncate text-xl font-bold">Welcome, {accountProfile?.full_name || userName}</span><span className="block truncate text-xs text-muted-foreground">{formData.company_name || "Company representative"}</span></span>
              </button>
            </div>
          </div>

          <div
            id="company-dashboard-content"
            className="w-full scroll-mt-20 space-y-6 overflow-auto p-4 sm:p-6"
          >
            {activeTab !== "overview" && companySectionDetails[activeTab] && <DashboardSectionHeader key={activeTab} ref={sectionHeaderRef} eyebrow="Company workspace" title={companySectionDetails[activeTab].title} description={companySectionDetails[activeTab].description} icon={companySectionDetails[activeTab].icon} status={companyProfileComplete ? { label: "Company profile complete", tone: "green" } : { label: "Profile setup required", tone: "amber" }} />}
            {activeTab === "overview" && (
              <div className="mx-auto w-full max-w-6xl space-y-5">
                <div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary">Company workspace</p><h2 className="mt-1 text-2xl font-bold">Manage your hiring operation</h2><p className="mt-1 text-sm text-muted-foreground">Use these cards or the side menu to open any company workspace.</p></div>
                {pendingOnboardingReviews > 0 && <button type="button" onClick={() => selectTab("employment")} className="group flex w-full items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left shadow-sm transition-all hover:border-amber-300 hover:shadow-md">
                  <span className="rounded-xl bg-amber-100 p-3 text-amber-700"><BellRing className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-amber-950">{pendingOnboardingReviews} onboarding {pendingOnboardingReviews === 1 ? "packet is" : "packets are"} ready for review</span><span className="mt-0.5 block text-sm text-amber-900/75">Open Hired officers, review the submitted records, and mark onboarding complete.</span></span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-amber-700 transition-transform group-hover:translate-x-1" />
                </button>}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {([
                    ["profile", "Company profile", companyProfileComplete ? "Complete" : "Finish your company details", Building2],
                    ["jobs", "Job postings", "Create and manage open positions", Briefcase],
                    ["sites", "Client sites", "Manage locations, addresses, and shifts", MapPinned],
                    ["applicants", "Applicants", "Review applications and move hiring forward", UserCheck],
                    ["interested", "Interested officers", "See officers interested in your work", Heart],
                    ["employment", "Hired officers", "Access records, documents, and evaluations", Users],
                    ["team", "Company team", "Manage staff access and roles", UsersRound],
                    ["subscriptions", "Subscription", companyProfile?.subscription_tier ? `${companyProfile.subscription_tier} plan` : "View plans and access", CreditCard],
                    ["account", "Account settings", "Update your name, username, photo, or password", Settings],
                  ] as const).map(([tab, title, description, Icon]) => <button key={tab} type="button" onClick={() => selectTab(tab)} className="group flex min-h-28 items-start gap-4 rounded-2xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                    <span className="rounded-xl bg-primary/10 p-3 text-primary"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </button>)}
                </div>
              </div>
            )}
            {activeTab === "profile" &&
              (profileLoaded ? (
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
                    window.location.href = "/browse";
                  }}
                  canEdit={companyTeamRole === "owner" || companyTeamRole === "admin"}
                />
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
                      <a href="/browse">Browse Professionals</a>
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
              />
            )}

            {activeTab === "interested" && companyProfile && (
              <>
                <JobApplicationsList companyId={companyProfile.id} />
                <div className="mt-8">
                  <InterestedOfficers
                    companyId={companyProfile.id}
                    subscriptionTier={companyProfile.subscription_tier ?? "free"}
                  />
                </div>
              </>
            )}

            {activeTab === "employment" && companyProfile && (
              <EmploymentTracking companyId={companyProfile.id} onPendingReviewCountChange={setPendingOnboardingReviews} />
            )}

            {activeTab === "team" && companyProfile && (
              <CompanyTeam companyId={companyProfile.id} />
            )}

            {activeTab === "subscriptions" && companyProfile && (
              <SubscriptionManager
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
