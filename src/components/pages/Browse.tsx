import { WorkspaceIdentityHeader } from "@/components/dashboard/WorkspaceIdentityHeader";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import Navbar from "@/components/Navbar";
import { CompanySidebar } from "@/components/dashboard/CompanySidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MapPin,
  ArrowLeft,
  DollarSign,
  Briefcase,
  Search,
  Heart,
  HeartOff,
  Lock,
  Calendar,
  MessageCircle,
} from "lucide-react";
import { Link } from "@/lib/router-compat";
import { ChatDialog } from "@/components/dashboard/ChatDialog";
import { ProfileAvatar } from "@/components/dashboard/ProfileAvatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import HireButton from "@/components/dashboard/HireButton";
import { toast } from "sonner";
import { ApplicantReviewDialog } from "@/components/dashboard/ApplicantReviewDialog";
import { loadCompanyWorkspaces, selectCompanyWorkspace } from "@/lib/company-workspaces";

const Browse = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCompanyId = searchParams.get("companyId");
  const [officers, setOfficers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [zipFilter, setZipFilter] = useState<string>("");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string>("all");
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [selectedApplication, setSelectedApplication] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [selectedOfficerCertifications, setSelectedOfficerCertifications] = useState<any[]>([]);
  const [officerInterests, setOfficerInterests] = useState<Record<string, string>>({});
  const [chatOpen, setChatOpen] = useState(false);

  const companyProfileIsComplete = (company: Record<string, unknown> | null) =>
    Boolean(
      company &&
      typeof company.company_name === "string" &&
      company.company_name.trim() &&
      typeof company.company_address === "string" &&
      company.company_address.trim() &&
      typeof company.company_city === "string" &&
      company.company_city.trim() &&
      typeof company.company_state === "string" &&
      company.company_state.trim() &&
      typeof company.company_zip === "string" &&
      company.company_zip.trim() &&
      typeof company.contact_person_name === "string" &&
      company.contact_person_name.trim() &&
      typeof company.contact_email === "string" &&
      company.contact_email.trim() &&
      typeof company.contact_cell_phone === "string" &&
      company.contact_cell_phone.trim(),
    );

  useEffect(() => {
    void checkAccess().catch((error) => {
      console.error("Failed to load company workspace", error);
      toast.error("The selected company workspace could not be loaded");
      setLoading(false);
    });
  }, [requestedCompanyId]);

  const checkAccess = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      toast.error("Please create a company account to browse security professionals");
      navigate("/auth?role=company");
      return;
    }

    // Get user profile to check role
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    setUserProfile(profile);

    // Redirect officers to their dashboard
    if (profile?.role === "officer") {
      toast.error("Officers cannot browse other officers' profiles");
      navigate("/dashboard");
      return;
    }

    const workspaces = await loadCompanyWorkspaces(session.user.id);
    const selectedWorkspace = selectCompanyWorkspace(workspaces, requestedCompanyId);
    const companyData = selectedWorkspace?.company || null;

    if (companyData && requestedCompanyId !== companyData.id) {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.set("companyId", companyData.id);
      setSearchParams(nextParams, { replace: true });
    }

    if (!companyData || !companyProfileIsComplete(companyData)) {
      toast.error(
        "Complete the company profile, including the hiring contact mobile number, before browsing security professionals",
      );
      navigate("/dashboard");
      return;
    }

    setCurrentUser(session.user);
    setCompanyProfile(companyData);
    await loadOfficers();
    await loadOfficerInterests(companyData.id);
  };

  const loadOfficerInterests = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from("officer_interests")
        .select("officer_id, status")
        .eq("company_id", companyId);

      if (error) throw error;

      const interestsMap: Record<string, string> = {};
      data?.forEach((interest) => {
        interestsMap[interest.officer_id] = interest.status;
      });
      setOfficerInterests(interestsMap);
    } catch (error) {
      console.error("Error loading officer interests:", error);
    }
  };

  const loadOfficers = async () => {
    try {
      const { data, error } = await supabase
        .from("officer_profiles")
        .select(
          `
          *,
          profiles:user_id (
            id,
            full_name,
            avatar_url
          )
        `,
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading officers:", error);
        toast.error("Failed to load officers. Please try again.");
      } else {
        setOfficers(data || []);
      }
    } catch (error) {
      console.error("Error loading officers:", error);
      toast.error("Failed to load officers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filteredOfficers = officers.filter((officer) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      officer.title?.toLowerCase().includes(searchLower) ||
      officer.location?.toLowerCase().includes(searchLower) ||
      officer.profiles?.full_name?.toLowerCase().includes(searchLower);

    const matchesState = stateFilter === "all" || officer.address_state === stateFilter;
    const matchesCity =
      !cityFilter || officer.address_city?.toLowerCase().includes(cityFilter.toLowerCase());
    const matchesZip = !zipFilter || officer.address_zip?.includes(zipFilter);

    let matchesAvailability = true;
    if (availabilityFilter !== "all" && officer.availability_schedule) {
      const schedule = officer.availability_schedule;
      if (availabilityFilter === "weekdays") {
        const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
        matchesAvailability = weekdays.some((day) => schedule[day]?.available === true);
      } else if (availabilityFilter === "weekends") {
        matchesAvailability =
          schedule.saturday?.available === true || schedule.sunday?.available === true;
      }
    }

    let matchesShift = true;
    if (shiftFilter !== "all" && officer.shift_preference) {
      matchesShift = officer.shift_preference.includes(shiftFilter);
    }

    let matchesEmploymentType = true;
    if (employmentTypeFilter !== "all" && officer.employment_type) {
      matchesEmploymentType = officer.employment_type.includes(employmentTypeFilter);
    }

    return (
      matchesSearch &&
      matchesState &&
      matchesCity &&
      matchesZip &&
      matchesAvailability &&
      matchesShift &&
      matchesEmploymentType
    );
  });

  const usStates = [
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming",
  ];

  const availabilityOptions = [
    { value: "weekdays", label: "Monday through Friday" },
    { value: "weekends", label: "Weekends Only" },
  ];

  const shiftOptions = [
    { value: "first_shift", label: "First Shift (Day)" },
    { value: "second_shift", label: "Second Shift (Evening)" },
    { value: "third_shift", label: "Third Shift (Night)" },
    { value: "weekend", label: "Weekends" },
  ];

  const employmentTypeOptions = [
    { value: "full_time", label: "Full-time" },
    { value: "part_time", label: "Part-time" },
    { value: "seasonal", label: "Seasonal" },
  ];

  const handleViewProfile = async (officer: any) => {
    if (searchParams.get("officerId") !== officer.id) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("officerId", officer.id);
      nextParams.set("officerSource", "browse");
      setSearchParams(nextParams, { replace: false });
    }

    if (companyProfile && ["professional", "premium"].includes(companyProfile.subscription_tier)) {
      const { data: applicantRecord, error: applicantError } = await (supabase as any)
        .from("job_applications")
        .select(
          `
          *,
          job_posting:job_postings!inner(title,company_id),
          officer:officer_profiles(id,user_id),
          hiring_application:guard_hiring_applications(application_data,status,submitted_at)
        `,
        )
        .eq("officer_id", officer.id)
        .eq("job_posting.company_id", companyProfile.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!applicantError && applicantRecord) {
        setSelectedApplication({
          ...applicantRecord,
          officerName: officer.profiles?.full_name || "Applicant",
        });
        return;
      }
    }
    setSelectedOfficer(officer);

    // Load officer certifications
    try {
      const { data: certs } = await supabase
        .from("certifications")
        .select("*")
        .eq("officer_id", officer.id)
        .eq("certification_type", "license")
        .order("created_at", { ascending: false });

      setSelectedOfficerCertifications(certs || []);
    } catch (error) {
      console.error("Error loading certifications:", error);
    }

    // Track profile view if user is a company
    if (companyProfile && currentUser) {
      try {
        await supabase.from("profile_views").insert({
          officer_id: officer.id,
          company_id: companyProfile.id,
          viewer_user_id: currentUser.id,
        });
      } catch (error) {
        console.error("Error tracking profile view:", error);
      }
    }
  };

  const closeOfficerRecord = () => {
    setSelectedOfficer(null);
    setSelectedApplication(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("officerId");
    nextParams.delete("officerSource");
    setSearchParams(nextParams, { replace: false });
  };

  useEffect(() => {
    const requestedOfficerId = searchParams.get("officerId");
    if (!requestedOfficerId) {
      setSelectedOfficer(null);
      setSelectedApplication(null);
      return;
    }
    if (selectedOfficer?.id === requestedOfficerId || selectedApplication?.officer?.id === requestedOfficerId) return;
    const officer = officers.find((entry) => entry.id === requestedOfficerId);
    if (officer) void handleViewProfile(officer);
  }, [officers, searchParams]);

  const handleInterest = async (officerId: string, status: "interested" | "not_interested") => {
    if (!companyProfile) {
      toast.error("Please create a company profile first");
      return;
    }

    try {
      const { error } = await supabase.from("officer_interests").upsert(
        {
          company_id: companyProfile.id,
          officer_id: officerId,
          status,
        },
        { onConflict: "company_id,officer_id" },
      );

      if (error) throw error;
      toast.success(
        `Officer marked as ${status === "interested" ? "interested" : "not interested"}`,
      );

      // Update local state
      setOfficerInterests((prev) => ({
        ...prev,
        [officerId]: status,
      }));
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleSendInterestEmail = async (officerId: string) => {
    if (!companyProfile) {
      toast.error("Please create a company profile first");
      return;
    }

    if (isFreeTier) {
      toast.error("Upgrade to Professional or Premium tier to send interest emails");
      return;
    }

    try {
      const { error } = await supabase.functions.invoke("express-interest", {
        body: { officerId, companyId: companyProfile?.id },
      });

      if (error) {
        console.error("Error sending email:", error);
        toast.error("Failed to send interest email");
      } else {
        toast.success("Interest email sent to officer!");
      }
    } catch (error: any) {
      console.error("Error:", error);
      toast.error("Failed to send interest email");
    }
  };

  const isFreeTier = !companyProfile || companyProfile.subscription_tier === "free";
  const canViewFullDetails =
    companyProfile && ["professional", "premium"].includes(companyProfile.subscription_tier);

  return (
    <div className="operations-workspace min-h-screen bg-slate-50/70">
      <Navbar />
      <SidebarProvider className="min-h-[calc(100vh-4rem)]">
      {companyProfile && <CompanySidebar activeTab="browse" companyId={companyProfile.id} profileComplete={companyProfileIsComplete(companyProfile)} onTabChange={(tab) => navigate(`/dashboard?viewAs=company&companyId=${encodeURIComponent(companyProfile.id)}&tab=${encodeURIComponent(tab)}`)} />}
      <div className="min-w-0 flex-1">
      {companyProfile ? (
        <WorkspaceIdentityHeader name={userProfile?.full_name} email={userProfile?.email} avatarUrl={userProfile?.avatar_url} subtitle={companyProfile.company_name || "Company representative"} onOpenAccount={() => navigate(`/dashboard?viewAs=company&companyId=${encodeURIComponent(companyProfile.id)}&tab=account`)}>
          <Button variant="ghost" size="sm" className="shrink-0 text-white hover:bg-slate-800 hover:text-white" asChild>
            <Link to={`/dashboard?viewAs=company&companyId=${encodeURIComponent(companyProfile.id)}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to Dashboard</Link>
          </Button>
        </WorkspaceIdentityHeader>
      ) : (
        <div className="border-b bg-background px-4 py-2">
          <Button variant="ghost" size="sm" asChild><Link to={currentUser ? "/dashboard" : "/"}><ArrowLeft className="mr-2 h-4 w-4" />{currentUser ? "Back to Dashboard" : "Back to Home"}</Link></Button>
        </div>
      )}
      <div className="container mx-auto max-w-7xl px-4 py-5">
        <div className="mb-5 border-b pb-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Recruiting workspace</p>
          <h1 className="mt-1 text-2xl font-bold">Find officers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Find qualified security officers for your needs
          </p>
        </div>

        <div className="mb-4 rounded-lg border bg-background p-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-72 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, title, or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <div className="min-w-[180px]">
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger>
                  <MapPin className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All States</SelectItem>
                  {usStates.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[150px]">
              <Input
                placeholder="City"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              />
            </div>

            <div className="min-w-[120px]">
              <Input
                placeholder="Zip Code"
                value={zipFilter}
                onChange={(e) => setZipFilter(e.target.value)}
              />
            </div>

            <div className="min-w-[200px]">
              <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
                <SelectTrigger>
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by Availability" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All Availability</SelectItem>
                  {availabilityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[180px]">
              <Select value={shiftFilter} onValueChange={setShiftFilter}>
                <SelectTrigger>
                  <Briefcase className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by Shift" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All Shifts</SelectItem>
                  {shiftOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[180px]">
              <Select value={employmentTypeFilter} onValueChange={setEmploymentTypeFilter}>
                <SelectTrigger>
                  <Briefcase className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Employment Type" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All Types</SelectItem>
                  {employmentTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div></div>
        </div>

        {loading ? (
          <div className="overflow-hidden rounded-lg border bg-background" aria-label="Loading officer roster">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 border-b p-3 last:border-b-0">
                <div className="h-10 w-10 rounded-full bg-muted" /><div className="flex-1 space-y-2"><div className="h-4 w-44 rounded bg-muted" /><div className="h-3 w-64 max-w-full rounded bg-muted" /></div><div className="h-8 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : filteredOfficers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground text-lg">
                No officers found. Try adjusting your search.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-background">
            <div className="hidden grid-cols-[minmax(260px,1.3fr)_minmax(160px,.8fr)_minmax(140px,.7fr)_110px] gap-4 border-b bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:grid">
              <span>Officer</span><span>Experience</span><span>Status</span><span className="text-right">Action</span>
            </div>
            {filteredOfficers.map((officer) => (
              <div key={officer.id} className="grid gap-3 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50/80 md:grid-cols-[minmax(260px,1.3fr)_minmax(160px,.8fr)_minmax(140px,.7fr)_110px] md:items-center md:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileAvatar name={officer.profiles?.full_name} src={officer.profiles?.avatar_url} className="h-10 w-10" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                        {isFreeTier && officer.profiles?.full_name
                          ? `${officer.profiles.full_name.split(" ")[0]} ${officer.profiles.full_name
                              .split(" ")
                              .slice(1)
                              .map((n: string) => n[0])
                              .join("")}.`
                          : officer.profiles?.full_name || "Anonymous"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{officer.title || "Security Officer"}{officer.location ? ` · ${officer.location}` : ""}</p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">{officer.years_experience ? `${officer.years_experience} years` : "Not listed"}{officer.hourly_rate ? <span className="block text-xs">${officer.hourly_rate}/hour</span> : null}</div>
                <div>{officer.availability_status === "available" ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Available</Badge> : <Badge variant="outline">View schedule</Badge>}</div>
                <Button size="sm" className="w-full md:w-auto" onClick={() => handleViewProfile(officer)}>View</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profile Detail Dialog */}
      <Dialog open={!!selectedOfficer} onOpenChange={(open) => !open && closeOfficerRecord()}>
        <DialogContent className="h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-none overflow-y-auto p-0 sm:h-[calc(100vh-2rem)] sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="sticky top-0 z-20 bg-slate-950 px-5 py-4 text-white shadow-sm">
            <div className="flex items-center gap-4"><ProfileAvatar name={selectedOfficer?.profiles?.full_name} src={selectedOfficer?.profiles?.avatar_url} className="h-16 w-16 border-2 border-white/30" /><div><DialogTitle className="text-2xl text-white">
              {isFreeTier && selectedOfficer?.profiles?.full_name
                ? `${selectedOfficer.profiles.full_name.split(" ")[0]} ${selectedOfficer.profiles.full_name
                    .split(" ")
                    .slice(1)
                    .map((n: string) => n[0])
                    .join("")}.`
                : selectedOfficer?.profiles?.full_name || "Officer Profile"}
            </DialogTitle>
            <DialogDescription className="text-slate-300">{selectedOfficer?.title || "Security Officer"}{selectedOfficer?.officer_number ? ` · Officer #${selectedOfficer.officer_number}` : ""}</DialogDescription></div></div>
          </DialogHeader>

          {selectedOfficer && (
            <div className="mx-auto w-full max-w-6xl space-y-4 p-5">
              {isFreeTier && (
                <Alert>
                  <Lock className="h-4 w-4" />
                  <AlertTitle>Limited Information Available</AlertTitle>
                  <AlertDescription>
                    Upgrade to Professional or Premium to view full officer details, including
                    contact information, work history, and certifications.
                    <Link to="/auth?role=company" className="block mt-2">
                      <Button variant="link" className="p-0 h-auto">
                        Upgrade Now
                      </Button>
                    </Link>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center gap-4">
                {selectedOfficer.availability_status === "available" && (
                  <Badge className="bg-green-100 text-green-800">Available</Badge>
                )}
                {!isFreeTier && selectedOfficer.officer_number && (
                  <span className="text-sm text-muted-foreground">
                    ID: {selectedOfficer.officer_number}
                  </span>
                )}
              </div>

              {selectedOfficer.bio && (
                <div>
                  <h3 className="font-semibold mb-2">About</h3>
                  <p className="text-sm text-muted-foreground">{selectedOfficer.bio}</p>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                {selectedOfficer.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedOfficer.location}</span>
                  </div>
                )}

                {selectedOfficer.years_experience && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {selectedOfficer.years_experience} years experience
                    </span>
                  </div>
                )}

                {canViewFullDetails && selectedOfficer.hourly_rate && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">${selectedOfficer.hourly_rate}/hour</span>
                  </div>
                )}

                {companyProfile?.subscription_tier === "premium" && selectedOfficer.phone && (
                  <div className="text-sm">
                    <span className="font-medium">Phone: </span>
                    {selectedOfficer.phone}
                  </div>
                )}

                {canViewFullDetails && selectedOfficer.profiles?.email && (
                  <div className="text-sm">
                    <span className="font-medium">Email: </span>
                    {selectedOfficer.profiles.email}
                  </div>
                )}
              </div>

              {canViewFullDetails && selectedOfficer.main_region && (
                <div>
                  <h3 className="font-semibold mb-2">Main Region</h3>
                  <p className="text-sm">{selectedOfficer.main_region}</p>
                </div>
              )}

              {/* License Credentials */}
              {canViewFullDetails && selectedOfficerCertifications.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">License Credentials</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedOfficerCertifications.map((cert) => {
                      const getLicenseLabel = (level: string) => {
                        switch (level) {
                          case "level-ii":
                            return "Non-Commission Certificate or License";
                          case "level-iii":
                            return "Commission Certificate or License";
                          case "level-iv":
                            return "Personal Protection Officer (PPO)";
                          default:
                            return cert.name;
                        }
                      };

                      const getBadgeColor = (level: string) => {
                        switch (level) {
                          case "level-ii":
                            return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100";
                          case "level-iii":
                            return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100";
                          case "level-iv":
                            return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100";
                          default:
                            return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100";
                        }
                      };

                      return (
                        <Badge key={cert.id} className={getBadgeColor(cert.license_level)}>
                          {getLicenseLabel(cert.license_level)}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Employment Type */}
              {canViewFullDetails &&
                selectedOfficer.employment_type &&
                selectedOfficer.employment_type.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Employment Type Preference</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedOfficer.employment_type.map((type: string) => {
                        const getTypeLabel = (empType: string) => {
                          switch (empType) {
                            case "full_time":
                              return "Full-time";
                            case "part_time":
                              return "Part-time";
                            case "seasonal":
                              return "Seasonal";
                            default:
                              return empType;
                          }
                        };

                        return (
                          <Badge key={type} variant="outline">
                            {getTypeLabel(type)}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

              {/* Availability Schedule */}
              {canViewFullDetails && selectedOfficer.availability_schedule && (
                <div>
                  <h3 className="font-semibold mb-2">Weekly Availability</h3>
                  <div className="space-y-2 text-sm">
                    {Object.entries(selectedOfficer.availability_schedule).map(
                      ([day, schedule]: [string, any]) => {
                        if (schedule?.start && schedule?.end) {
                          return (
                            <div key={day} className="flex justify-between items-center">
                              <span className="font-medium capitalize">{day}:</span>
                              <span className="text-muted-foreground">
                                {schedule.start} - {schedule.end}
                              </span>
                            </div>
                          );
                        }
                        return null;
                      },
                    )}
                  </div>
                </div>
              )}

              {companyProfile && (
                <div className="pt-4 border-t space-y-3">
                  <div className="flex gap-2">
                    {officerInterests[selectedOfficer.id] === "interested" ? (
                      <Button
                        variant="outline"
                        className="flex-1 bg-red-500 text-white hover:bg-red-600 hover:text-white border-red-500"
                        onClick={() => handleInterest(selectedOfficer.id, "interested")}
                      >
                        <Heart className="w-4 h-4 mr-2 fill-current" />
                        Interested
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleInterest(selectedOfficer.id, "interested")}
                      >
                        <Heart className="w-4 h-4 mr-2" />
                        Interested
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleInterest(selectedOfficer.id, "not_interested")}
                    >
                      <HeartOff className="w-4 h-4 mr-2" />
                      Not Interested
                    </Button>
                  </div>

                  {isFreeTier ? (
                    <div className="space-y-2">
                      <Button className="w-full" disabled>
                        <Lock className="w-4 h-4 mr-2" />
                        Send Interest Email (Premium Feature)
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Upgrade to Professional or Premium to send interest emails
                      </p>
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => handleSendInterestEmail(selectedOfficer.id)}
                    >
                      Send Interest Email to Officer
                    </Button>
                  )}

                  {canViewFullDetails && (
                    <>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={async () => {
                          // Check conversation limits
                          const { data: companyConversations } = await supabase
                            .from("messages")
                            .select("officer_id")
                            .eq("company_id", companyProfile.id);

                          const uniqueOfficers = new Set(
                            companyConversations?.map((m) => m.officer_id) || [],
                          );

                          if (
                            companyProfile.subscription_tier === "free" &&
                            uniqueOfficers.size >= 3 &&
                            !uniqueOfficers.has(selectedOfficer.id)
                          ) {
                            toast.error(
                              "You've reached the limit of 3 conversations on the free tier. Upgrade to chat with more officers.",
                            );
                            return;
                          }

                          setChatOpen(true);
                        }}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Chat with Officer
                      </Button>
                      <HireButton
                        officerId={selectedOfficer.id}
                        officerName={selectedOfficer.profiles?.full_name || "Officer"}
                        companyId={companyProfile.id}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ApplicantReviewDialog
        open={Boolean(selectedApplication)}
        onOpenChange={(open) => !open && closeOfficerRecord()}
        application={selectedApplication}
      />

      {/* Chat Dialog */}
      {selectedOfficer && companyProfile && chatOpen && (
        <ChatDialog
          open={chatOpen}
          onOpenChange={setChatOpen}
          companyId={companyProfile.id}
          companyName={companyProfile.company_name}
          officerId={selectedOfficer.id}
          officerName={selectedOfficer.profiles?.full_name || "Officer"}
          currentUserType="company"
        />
      )}
      </div>
      </SidebarProvider>
    </div>
  );
};

export default Browse;
