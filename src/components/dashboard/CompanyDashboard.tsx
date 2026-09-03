import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Building2, Crown, Users, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

interface CompanyDashboardProps {
  userId: string;
  userName: string;
}

const CompanyDashboard = ({ userId, userName }: CompanyDashboardProps) => {
  const [searchParams] = useSearchParams();
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "profile");
  const [formData, setFormData] = useState({
    company_name: "",
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

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    const { data } = await supabase
      .from("company_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (data) {
      setCompanyProfile(data);
      setFormData({
        company_name: data.company_name || "",
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
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Math.random()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(fileName);

      setFormData({ ...formData, logo_url: publicUrl });
      toast.success("Logo uploaded successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Upload logo if a new file was selected
      if (logoFile) {
        await handleLogoUpload(logoFile);
      }

      const profileData = {
        user_id: userId,
        ...formData,
        year_founded: formData.year_founded ? parseInt(formData.year_founded) : null,
      };

      if (companyProfile) {
        const { error } = await supabase
          .from("company_profiles")
          .update(profileData)
          .eq("id", companyProfile.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_profiles")
          .insert(profileData);

        if (error) throw error;
      }

      toast.success("Company profile updated successfully!");
      loadProfile();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getTierBadge = (tier: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      free: { variant: "secondary", icon: null },
      professional: { variant: "default", icon: Users },
      premium: { variant: "default", icon: Crown },
    };

    const config = variants[tier] || variants.free;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className={tier === "premium" ? "bg-accent text-accent-foreground" : ""}>
        {Icon && <Icon className="h-3 w-3 mr-1" />}
        {tier.charAt(0).toUpperCase() + tier.slice(1)}
      </Badge>
    );
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-[calc(100vh-4rem)] w-full">
        <CompanySidebar activeTab={activeTab} onTabChange={setActiveTab} />
        
        <div className="flex-1 flex flex-col min-w-0">
          <div className="border-b bg-background sticky top-0 z-10">
            <div className="flex h-16 items-center px-4 gap-4">
              <SidebarTrigger />
              {formData.logo_url && (
                <img
                  src={formData.logo_url}
                  alt={formData.company_name}
                  className="h-10 w-10 object-contain rounded"
                />
              )}
              <h1 className="text-2xl font-bold">Welcome, {formData.company_name || userName}</h1>
            </div>
          </div>
          
          <div className="p-6 space-y-6 w-full overflow-auto">
            {activeTab === "profile" && (
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
                          <Button size="sm" onClick={() => setActiveTab("subscriptions")}>
                            Upgrade
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {companyProfile?.subscription_tier === "free" && "Upgrade for more features"}
                        {companyProfile?.subscription_tier === "professional" && "Access to direct messaging"}
                        {companyProfile?.subscription_tier === "premium" && "Full access to all features"}
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
                      <AlertTriangle className={`h-4 w-4 ${urgentExpiring ? "text-destructive" : "text-muted-foreground"}`} />
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${urgentExpiring ? "text-destructive" : ""}`}>
                        {expiringItems.length}
                      </div>
                      <p className={`text-xs ${urgentExpiring ? "text-destructive" : "text-muted-foreground"}`}>
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
                              {item.officerName ? `${item.officerName} — ` : ""}{item.name} (
                              {item.daysLeft < 0 ? "expired" : item.daysLeft === 0 ? "today" : `${item.daysLeft}d`})
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
                    <CardDescription>
                      Update your company details
                    </CardDescription>
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
                            onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
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
                            onValueChange={(value) => setFormData({ ...formData, company_size: value })}
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
                            onValueChange={(value) => setFormData({ ...formData, years_in_business: value })}
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
                            onChange={(e) => setFormData({ ...formData, year_founded: e.target.value })}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="logo_url">Company Logo</Label>
                          <div className="flex items-center gap-4">
                            {formData.logo_url && (
                              <img src={formData.logo_url} alt="Company Logo" className="h-16 w-16 object-contain rounded border" />
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
                          {uploadingLogo && <p className="text-sm text-muted-foreground">Uploading logo...</p>}
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
                              onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="linkedin_url">LinkedIn</Label>
                            <Input
                              id="linkedin_url"
                              type="url"
                              placeholder="https://linkedin.com/company/yourcompany"
                              value={formData.linkedin_url}
                              onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="facebook_url">Facebook</Label>
                            <Input
                              id="facebook_url"
                              type="url"
                              placeholder="https://facebook.com/yourcompany"
                              value={formData.facebook_url}
                              onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="twitter_url">Twitter</Label>
                            <Input
                              id="twitter_url"
                              type="url"
                              placeholder="https://twitter.com/yourcompany"
                              value={formData.twitter_url}
                              onChange={(e) => setFormData({ ...formData, twitter_url: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="instagram_url">Instagram</Label>
                            <Input
                              id="instagram_url"
                              type="url"
                              placeholder="https://instagram.com/yourcompany"
                              value={formData.instagram_url}
                              onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
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
                              onChange={(e) => setFormData({ ...formData, contact_person_name: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="contact_person_title">Title</Label>
                            <Input
                              id="contact_person_title"
                              placeholder="HR Manager"
                              value={formData.contact_person_title}
                              onChange={(e) => setFormData({ ...formData, contact_person_title: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="contact_person_position">Position at Company</Label>
                            <Input
                              id="contact_person_position"
                              placeholder="Director of Operations"
                              value={formData.contact_person_position}
                              onChange={(e) => setFormData({ ...formData, contact_person_position: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="contact_email">Email Address</Label>
                            <Input
                              id="contact_email"
                              type="email"
                              placeholder="contact@company.com"
                              value={formData.contact_email}
                              onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="company_phone">Company Phone Number</Label>
                            <Input
                              id="company_phone"
                              type="tel"
                              placeholder="(555) 123-4567"
                              value={formData.company_phone}
                              onChange={(e) => setFormData({ ...formData, company_phone: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="company_phone_ext">Phone Extension</Label>
                            <Input
                              id="company_phone_ext"
                              placeholder="1234"
                              value={formData.company_phone_ext}
                              onChange={(e) => setFormData({ ...formData, company_phone_ext: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="contact_cell_phone">Cell Phone Number</Label>
                            <Input
                              id="contact_cell_phone"
                              type="tel"
                              placeholder="(555) 987-6543"
                              value={formData.contact_cell_phone}
                              onChange={(e) => setFormData({ ...formData, contact_cell_phone: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="contact_email">Contact Email</Label>
                            <Input
                              id="contact_email"
                              type="email"
                              placeholder="hiring@company.com"
                              value={formData.contact_email}
                              onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="license_number">Company License Number</Label>
                            <Input
                              id="license_number"
                              placeholder="e.g., A12345"
                              value={formData.license_number}
                              onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="licensed_states">Licensed States</Label>
                            <Input
                              id="licensed_states"
                              placeholder="e.g., TX, CA, FL (comma-separated)"
                              value={formData.licensed_states.join(", ")}
                              onChange={(e) => {
                                const states = e.target.value.split(",").map(s => s.trim()).filter(s => s);
                                setFormData({ ...formData, licensed_states: states });
                              }}
                            />
                            <p className="text-xs text-muted-foreground">Enter state abbreviations separated by commas</p>
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
                                Authorized to operate as a private investigations company. Limited to investigations, does not include general security contracting.
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
                                  Authorized to operate as a security contractor. May include one or more subcategories:
                                </p>
                              </div>
                            </div>
                            <div className="ml-8 space-y-2 text-sm">
                              {["Alarm Systems", "Armored Car", "Courier", "Electronic Access", "Guard", "Locksmith"].map((subtype) => (
                                <div key={subtype} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`class-b-${subtype.toLowerCase().replace(" ", "-")}`}
                                    checked={formData.license_types.includes(`Class B - ${subtype}`)}
                                    onCheckedChange={(checked) => {
                                      setFormData({
                                        ...formData,
                                        license_types: checked
                                          ? [...formData.license_types, `Class B - ${subtype}`]
                                          : formData.license_types.filter((t) => t !== `Class B - ${subtype}`),
                                      });
                                    }}
                                  />
                                  <Label htmlFor={`class-b-${subtype.toLowerCase().replace(" ", "-")}`} className="cursor-pointer font-normal">
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
                                Provides both private investigation services and all types of security contractor services covered under Class A and Class B licenses.
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

            {activeTab === "applicants" && companyProfile && (
              <JobApplicants
                companyId={companyProfile.id}
                subscriptionTier={companyProfile.subscription_tier}
                onNavigateToSubscriptions={() => setActiveTab("subscriptions")}
              />
            )}

            {activeTab === "interested" && companyProfile && (
              <>
                <JobApplicationsList companyId={companyProfile.id} />
                <div className="mt-8">
                  <InterestedOfficers 
                    companyId={companyProfile.id}
                    subscriptionTier={companyProfile.subscription_tier}
                  />
                </div>
              </>
            )}

            {activeTab === "employment" && companyProfile && (
              <EmploymentTracking companyId={companyProfile.id} />
            )}

            {activeTab === "subscriptions" && companyProfile && (
              <SubscriptionManager
                currentTier={companyProfile.subscription_tier}
                onUpgrade={(tier) => {
                  toast.success(`Upgrading to ${tier}...`);
                }}
              />
            )}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default CompanyDashboard;
