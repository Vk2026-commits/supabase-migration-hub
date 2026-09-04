import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { AlertTriangle, Award, Video, User, Briefcase, Clock, Upload, FileText, GraduationCap, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CertificationsManager } from "./CertificationsManager";
import { PhotoUpload } from "./PhotoUpload";
import { OfficerPhotos } from "./OfficerPhotos";
import { WorkHistory } from "./WorkHistory";
import { OfficerMessages } from "./OfficerMessages";
import { OfficerChatPanel } from "./OfficerChatPanel";
import { InterestedJobsPanel } from "./InterestedJobsPanel";
import JobSearch from "./JobSearch";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { OfficerSidebar } from "./OfficerSidebar";
import { useExpiringCredentials } from "@/hooks/useExpiringCredentials";

interface OfficerDashboardProps {
  userId: string;
}

const OfficerDashboard = ({ userId }: OfficerDashboardProps) => {
  const [activeTab, setActiveTab] = useState("profile");
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

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const ensureOfficerProfile = async () => {
    if (!officerProfile) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error("You must be logged in");
          return null;
        }
        // Call backend function using elevated privileges to ensure a row exists
        const { data, error } = await supabase.functions.invoke('ensure-officer-profile', { body: {} });
        if (error) throw error;
        // After ensuring, fetch the profile row
        const { data: ensured } = await supabase
          .from('officer_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (ensured) setOfficerProfile(ensured);
        return ensured ?? null;
      } catch (error: any) {
        toast.error("Failed to create profile");
        return null;
      }
    }
    return officerProfile;
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
        const [certsResult, trainingsResult, workResult] = await Promise.all([
          supabase.from("certifications").select("id", { count: 'exact' }).eq("officer_id", data.id).neq("certification_type", "training"),
          supabase.from("certifications").select("id", { count: 'exact' }).eq("officer_id", data.id).eq("certification_type", "training"),
          supabase.from("work_history").select("id", { count: 'exact' }).eq("officer_id", data.id)
        ]);
        
        setCertCount(certsResult.count || 0);
        setTrainingCount(trainingsResult.count || 0);
        setWorkHistoryCount(workResult.count || 0);
        // Photos count is based on avatar_url presence
        setPhotoCount(data.avatar_url ? 1 : 0);
      }
    }
  };

  const handlePhotoChange = async (url: string) => {
    try {
      const { error } = await supabase
        .from("officer_profiles")
        .update({ avatar_url: url })
        .eq("user_id", userId);

      if (error) throw error;
      loadProfile();
    } catch (error: any) {
      toast.error("Failed to update profile photo");
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
        const oldPath = officerProfile.resume_url.split("/resumes/")[1];
        if (oldPath) {
          await supabase.storage.from("resumes").remove([oldPath]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("resumes").getPublicUrl(filePath);

      const { error } = await supabase
        .from("officer_profiles")
        .update({ resume_url: data.publicUrl })
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
    photos: photoCount > 0,
    certifications: certCount > 0,
    workHistory: workHistoryCount > 0,
  };

  return (
    <SidebarProvider>
      <div className="flex w-full min-h-screen">
        <OfficerSidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          completionStatus={completionStatus}
        />
        <div className="flex-1 flex">
          <div className="flex-1 p-8">
            <div className="mb-4">
              <SidebarTrigger />
            </div>
            <h1 className="text-3xl font-bold mb-4">
              Welcome, {profile?.full_name || profile?.email}
            </h1>

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

          <div className="space-y-6">
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
          onClick={() => setActiveTab("certifications")}
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

        <Card>
          <CardHeader className="flex h-[4.5rem] flex-row items-start justify-between space-y-0 py-2">
            <CardTitle className="text-sm font-medium leading-tight">Video Interviews</CardTitle>
            <Video className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Upload your interview</p>
          </CardContent>
        </Card>
      </div>
            )}

            {activeTab === "profile" && (
          <Card>
            <CardHeader>
              <CardTitle>Professional Profile</CardTitle>
              <CardDescription>
                Update your profile information to attract potential employers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex flex-col items-center pb-4 border-b space-y-3">
                  <PhotoUpload
                    userId={userId}
                    currentPhotoUrl={officerProfile?.avatar_url}
                    onPhotoChange={handlePhotoChange}
                    size="lg"
                  />
                  <div className="text-center max-w-md">
                    <p className="text-sm text-muted-foreground">
                      Upload a professional headshot photo to make a great first impression with potential employers. 
                      A clear, well-lit photo can significantly increase your chances of getting hired.
                    </p>
                  </div>
                </div>
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

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="address_street">Home Address</Label>
                    <Input
                      id="address_street"
                      placeholder="Street Address"
                      value={formData.address_street}
                      onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address_unit">Apt/Unit</Label>
                    <Input
                      id="address_unit"
                      placeholder="Apt, Unit, etc."
                      value={formData.address_unit}
                      onChange={(e) => setFormData({ ...formData, address_unit: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address_city">City</Label>
                    <Input
                      id="address_city"
                      placeholder="City"
                      value={formData.address_city}
                      onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address_state">State</Label>
                    <Input
                      id="address_state"
                      placeholder="State"
                      value={formData.address_state}
                      onChange={(e) => setFormData({ ...formData, address_state: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address_zip">ZIP Code</Label>
                    <Input
                      id="address_zip"
                      placeholder="ZIP Code"
                      value={formData.address_zip}
                      onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                    />
                  </div>

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
                        onClick={() => window.open(officerProfile.resume_url, '_blank')}
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

                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Save Profile"}
                </Button>
                </form>
              </CardContent>
            </Card>
            )}

            {activeTab === "availability" && (
          <Card>
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
                  <Button onClick={handleSubmit} disabled={loading}>
                    {loading ? "Saving..." : "Save Availability"}
                  </Button>
                </div>
                </div>
              </CardContent>
            </Card>
            )}

            {activeTab === "photos" && (
              <OfficerPhotos userId={userId} />
            )}

            {activeTab === "certifications" && (
            <CertificationsManager 
              officerId={officerProfile?.id || ""} 
              userId={userId}
              onEnsureProfile={ensureOfficerProfile}
            />
            )}

            {activeTab === "work-history" && (
            <WorkHistory 
              officerId={officerProfile?.id || ""} 
              userId={userId}
              onEnsureProfile={ensureOfficerProfile}
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
            <div className="w-96 border-l bg-muted/20 p-4 overflow-y-auto space-y-4">
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
