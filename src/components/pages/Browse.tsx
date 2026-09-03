import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@/lib/router-compat";
import Navbar from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, DollarSign, Briefcase, Search, Heart, HeartOff, Lock, Calendar, MessageCircle } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { ChatDialog } from "@/components/dashboard/ChatDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import HireButton from "@/components/dashboard/HireButton";
import { toast } from "sonner";

const Browse = () => {
  const navigate = useNavigate();
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
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [selectedOfficerCertifications, setSelectedOfficerCertifications] = useState<any[]>([]);
  const [officerInterests, setOfficerInterests] = useState<Record<string, string>>({});
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
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

    // Check if user has company profile
    const { data: companyData } = await supabase
      .from("company_profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!companyData) {
      toast.error("Please complete your company profile to browse security professionals");
      navigate("/dashboard");
      return;
    }

    setCurrentUser(session.user);
    setCompanyProfile(companyData);
    await loadOfficers();
    await loadOfficerInterests(companyData.id);
  };

  const loadUserProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setCurrentUser(session.user);
      const { data } = await supabase
        .from("company_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();
      setCompanyProfile(data);
    }
  };

  const loadOfficerInterests = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from("officer_interests")
        .select("officer_id, status")
        .eq("company_id", companyId);

      if (error) throw error;

      const interestsMap: Record<string, string> = {};
      data?.forEach(interest => {
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
        .select(`
          *,
          profiles:user_id (
            id,
            full_name,
            avatar_url
          )
        `)
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
    const matchesSearch = (
      officer.title?.toLowerCase().includes(searchLower) ||
      officer.location?.toLowerCase().includes(searchLower) ||
      officer.profiles?.full_name?.toLowerCase().includes(searchLower)
    );

    const matchesState = stateFilter === "all" || officer.address_state === stateFilter;
    const matchesCity = !cityFilter || officer.address_city?.toLowerCase().includes(cityFilter.toLowerCase());
    const matchesZip = !zipFilter || officer.address_zip?.includes(zipFilter);

    let matchesAvailability = true;
    if (availabilityFilter !== "all" && officer.availability_schedule) {
      const schedule = officer.availability_schedule;
      if (availabilityFilter === "weekdays") {
        const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
        matchesAvailability = weekdays.some(day => schedule[day]?.available === true);
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

    return matchesSearch && matchesState && matchesCity && matchesZip && matchesAvailability && matchesShift && matchesEmploymentType;
  });

  const usStates = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware",
    "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
    "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
    "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico",
    "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania",
    "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
  ];

  const availabilityOptions = [
    { value: "weekdays", label: "Monday through Friday" },
    { value: "weekends", label: "Weekends Only" }
  ];

  const shiftOptions = [
    { value: "first_shift", label: "First Shift (Day)" },
    { value: "second_shift", label: "Second Shift (Evening)" },
    { value: "third_shift", label: "Third Shift (Night)" },
    { value: "weekend", label: "Weekends" }
  ];

  const employmentTypeOptions = [
    { value: "full_time", label: "Full-time" },
    { value: "part_time", label: "Part-time" },
    { value: "seasonal", label: "Seasonal" }
  ];

  const handleViewProfile = async (officer: any) => {
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

  const handleInterest = async (officerId: string, status: 'interested' | 'not_interested') => {
    if (!companyProfile) {
      toast.error("Please create a company profile first");
      return;
    }

    try {
      const { error } = await supabase
        .from("officer_interests")
        .upsert(
          {
            company_id: companyProfile.id,
            officer_id: officerId,
            status,
          },
          { onConflict: 'company_id,officer_id' }
        );

      if (error) throw error;
      toast.success(`Officer marked as ${status === 'interested' ? 'interested' : 'not interested'}`);
      
      // Update local state
      setOfficerInterests(prev => ({
        ...prev,
        [officerId]: status
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
      const { error } = await supabase.functions.invoke('express-interest', {
        body: { officerId }
      });
      
      if (error) {
        console.error('Error sending email:', error);
        toast.error('Failed to send interest email');
      } else {
        toast.success('Interest email sent to officer!');
      }
    } catch (error: any) {
      console.error('Error:', error);
      toast.error('Failed to send interest email');
    }
  };

  const isFreeTier = !companyProfile || companyProfile.subscription_tier === 'free';
  const canViewFullDetails = companyProfile && ['professional', 'premium'].includes(companyProfile.subscription_tier);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Browse Security Professionals</h1>
          <p className="text-muted-foreground text-lg">
            Find qualified security officers for your needs
          </p>
        </div>

        <div className="mb-6 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, title, or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-2">
            <div className="min-w-[180px]">
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger>
                  <MapPin className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">All States</SelectItem>
                  {usStates.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
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
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
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
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="h-20 bg-muted rounded" />
                </CardContent>
              </Card>
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
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOfficers.map((officer) => (
              <Card key={officer.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">
                        {isFreeTier && officer.profiles?.full_name 
                          ? `${officer.profiles.full_name.split(' ')[0]} ${officer.profiles.full_name.split(' ').slice(1).map((n: string) => n[0]).join('')}.`
                          : officer.profiles?.full_name || "Anonymous"}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {officer.title || "Security Officer"}
                      </CardDescription>
                    </div>
                    {officer.availability_status === "available" && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                        Available
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {officer.bio || "No bio provided yet."}
                  </p>

                  <div className="space-y-2 text-sm">
                    {officer.location && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{officer.location}</span>
                      </div>
                    )}
                    
                    {officer.years_experience && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Briefcase className="h-4 w-4" />
                        <span>{officer.years_experience} years experience</span>
                      </div>
                    )}

                    {officer.hourly_rate && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <DollarSign className="h-4 w-4" />
                        <span>${officer.hourly_rate}/hour</span>
                      </div>
                    )}
                  </div>

                  <Button 
                    className="w-full" 
                    onClick={() => handleViewProfile(officer)}
                  >
                    View Profile
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Profile Detail Dialog */}
      <Dialog open={!!selectedOfficer} onOpenChange={(open) => !open && setSelectedOfficer(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {isFreeTier && selectedOfficer?.profiles?.full_name 
                ? `${selectedOfficer.profiles.full_name.split(' ')[0]} ${selectedOfficer.profiles.full_name.split(' ').slice(1).map((n: string) => n[0]).join('')}.`
                : selectedOfficer?.profiles?.full_name || "Officer Profile"}
            </DialogTitle>
            <DialogDescription>
              {selectedOfficer?.title || "Security Officer"}
            </DialogDescription>
          </DialogHeader>
          
          {selectedOfficer && (
            <div className="space-y-4">
              {isFreeTier && (
                <Alert>
                  <Lock className="h-4 w-4" />
                  <AlertTitle>Limited Information Available</AlertTitle>
                  <AlertDescription>
                    Upgrade to Professional or Premium to view full officer details, including contact information, work history, and certifications.
                    <Link to="/auth?role=company" className="block mt-2">
                      <Button variant="link" className="p-0 h-auto">Upgrade Now</Button>
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
                    <span className="text-sm">{selectedOfficer.years_experience} years experience</span>
                  </div>
                )}

                {canViewFullDetails && selectedOfficer.hourly_rate && (
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">${selectedOfficer.hourly_rate}/hour</span>
                  </div>
                )}

                {companyProfile?.subscription_tier === 'premium' && selectedOfficer.phone && (
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
                        <Badge 
                          key={cert.id}
                          className={getBadgeColor(cert.license_level)}
                        >
                          {getLicenseLabel(cert.license_level)}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Employment Type */}
              {canViewFullDetails && selectedOfficer.employment_type && selectedOfficer.employment_type.length > 0 && (
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
                    {Object.entries(selectedOfficer.availability_schedule).map(([day, schedule]: [string, any]) => {
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
                    })}
                  </div>
                </div>
              )}

              {companyProfile && (
                <div className="pt-4 border-t space-y-3">
                  <div className="flex gap-2">
                    {officerInterests[selectedOfficer.id] === 'interested' ? (
                      <Button 
                        variant="outline"
                        className="flex-1 bg-red-500 text-white hover:bg-red-600 hover:text-white border-red-500"
                        onClick={() => handleInterest(selectedOfficer.id, 'interested')}
                      >
                        <Heart className="w-4 h-4 mr-2 fill-current" />
                        Interested
                      </Button>
                    ) : (
                      <Button 
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleInterest(selectedOfficer.id, 'interested')}
                      >
                        <Heart className="w-4 h-4 mr-2" />
                        Interested
                      </Button>
                    )}
                    <Button 
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleInterest(selectedOfficer.id, 'not_interested')}
                    >
                      <HeartOff className="w-4 h-4 mr-2" />
                      Not Interested
                    </Button>
                  </div>
                  
                  {isFreeTier ? (
                    <div className="space-y-2">
                      <Button 
                        className="w-full"
                        disabled
                      >
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
                          
                          const uniqueOfficers = new Set(companyConversations?.map(m => m.officer_id) || []);
                          
                          if (companyProfile.subscription_tier === 'free' && uniqueOfficers.size >= 3 && !uniqueOfficers.has(selectedOfficer.id)) {
                            toast.error("You've reached the limit of 3 conversations on the free tier. Upgrade to chat with more officers.");
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
  );
};

export default Browse;
