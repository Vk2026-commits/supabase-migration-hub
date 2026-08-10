import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Briefcase, MapPin, DollarSign, CheckCircle, ThumbsUp, ThumbsDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "@/lib/router-compat";

const JobListings = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [officerProfile, setOfficerProfile] = useState<any>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [jobApplications, setJobApplications] = useState<Record<string, string>>({});

  useEffect(() => {
    loadJobs();
    checkUser();
  }, []);

  useEffect(() => {
    if (officerProfile) {
      loadJobApplications();
    }
  }, [officerProfile]);

  useEffect(() => {
    if (selectedJob && officerProfile) {
      checkApplication();
    }
  }, [selectedJob, officerProfile]);

  const loadJobApplications = async () => {
    if (!officerProfile) return;

    const { data } = await supabase
      .from("job_applications")
      .select("job_posting_id, status")
      .eq("officer_id", officerProfile.id);

    const applicationsMap: Record<string, string> = {};
    data?.forEach(app => {
      applicationsMap[app.job_posting_id] = app.status;
    });
    setJobApplications(applicationsMap);
  };

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "officer") {
        const { data: officerData } = await supabase
          .from("officer_profiles")
          .select("*")
          .eq("user_id", user.id)
          .single();

        setOfficerProfile(officerData);
        
        // Check if profile is complete (at least title and phone)
        if (officerData) {
          setProfileComplete(!!officerData.title && !!officerData.phone);
        }
      }
    }
  };

  const loadJobs = async () => {
    const { data, error } = await supabase
      .from("job_postings")
      .select("*, company_profiles(company_name, logo_url)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("Failed to load jobs:", error);
      return;
    }
    setJobs(data || []);
  };

  const checkApplication = async () => {
    if (!selectedJob || !officerProfile) return;

    const { data } = await supabase
      .from("job_applications")
      .select("id")
      .eq("job_posting_id", selectedJob.id)
      .eq("officer_id", officerProfile.id)
      .maybeSingle();

    setHasApplied(!!data);
  };

  const handleInterestClick = async (jobId: string, status: 'interested' | 'not_interested', event: React.MouseEvent) => {
    event.stopPropagation();

    if (!currentUser) {
      setShowAuthPrompt(true);
      return;
    }

    if (!officerProfile) {
      toast.error("Only security officers can apply for jobs");
      return;
    }
    
    if (!profileComplete) {
      toast.error("Please complete your profile before applying", {
        action: {
          label: "Go to Profile",
          onClick: () => navigate("/dashboard")
        }
      });
      return;
    }

    try {
      // Get job details for message
      const job = jobs.find(j => j.id === jobId);
      
      const { error } = await supabase
        .from("job_applications")
        .upsert({
          job_posting_id: jobId,
          officer_id: officerProfile.id,
          status,
        }, {
          onConflict: 'job_posting_id,officer_id'
        });

      if (error) throw error;

      // Send message to employer if interested
      if (status === 'interested' && job) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", currentUser.id)
          .single();

        const { error: msgError } = await supabase
          .from("messages")
          .insert({
            company_id: job.company_id,
            officer_id: officerProfile.id,
            sender_type: 'officer',
            message: `${profileData?.full_name || 'An officer'} is interested in your "${job.title}" position.`,
            is_read: false
          });
        if (msgError) {
          console.error('Failed to notify employer:', msgError);
        }
      }

      toast.success(status === 'interested' ? "Added to interested jobs! Employer notified." : "Marked as not interested");
      setJobApplications(prev => ({ ...prev, [jobId]: status }));
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message);
    }
  };

  const handleJobClick = (job: any) => {
    if (!currentUser) {
      setSelectedJob(job);
      setShowAuthPrompt(true);
      return;
    }
    
    if (!profileComplete) {
      toast.error("Please complete your profile before applying for jobs", {
        action: {
          label: "Go to Profile",
          onClick: () => navigate("/dashboard")
        }
      });
      return;
    }
    
    setSelectedJob(job);
  };

  const handleInterest = async () => {
    if (!currentUser) {
      setShowAuthPrompt(true);
      return;
    }

    if (!officerProfile) {
      toast.error("Only security officers can apply for jobs");
      return;
    }
    
    if (!profileComplete) {
      toast.error("Please complete your profile before applying", {
        action: {
          label: "Go to Profile",
          onClick: () => navigate("/dashboard")
        }
      });
      return;
    }

    try {
      const { error } = await supabase.from("job_applications").insert({
        job_posting_id: selectedJob.id,
        officer_id: officerProfile.id,
        status: "interested",
      });

      if (error) throw error;

      toast.success("Interest sent! The company has been notified.");
      setHasApplied(true);
    } catch (error: any) {
      if (error.code === "23505") {
        toast.error("You've already expressed interest in this position");
      } else {
        toast.error(error.message);
      }
    }
  };

  if (jobs.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Job Openings
          </CardTitle>
          <CardDescription>Latest security positions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="border rounded-lg p-3 hover:bg-accent/50 transition-colors"
            >
              <div onClick={() => handleJobClick(job)} className="cursor-pointer">
                <h4 className="font-semibold text-sm mb-1">{job.title}</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  {job.company_profiles?.company_name}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {job.location}
                </div>
                {job.hourly_rate_min && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <DollarSign className="h-3 w-3" />
                    ${job.hourly_rate_min}{job.hourly_rate_max && ` - $${job.hourly_rate_max}`}/hr
                  </div>
                )}
              </div>
              
              {currentUser && officerProfile && (
                <div className="flex gap-2 mt-3 pt-3 border-t">
                  <Button 
                    size="sm"
                    variant={jobApplications[job.id] === 'interested' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={(e) => handleInterestClick(job.id, 'interested', e)}
                  >
                    <ThumbsUp className="h-3 w-3 mr-1" />
                    {jobApplications[job.id] === 'interested' ? 'Interested' : 'Interested'}
                  </Button>
                  <Button 
                    size="sm"
                    variant={jobApplications[job.id] === 'not_interested' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={(e) => handleInterestClick(job.id, 'not_interested', e)}
                  >
                    <ThumbsDown className="h-3 w-3 mr-1" />
                    Not Interested
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={showAuthPrompt} onOpenChange={setShowAuthPrompt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign In Required</DialogTitle>
            <DialogDescription>
              You need to sign in as a security professional and complete your profile to view and apply for job postings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-4">
            <Button 
              onClick={() => navigate("/auth?role=officer")} 
              className="w-full"
            >
              Sign In / Create Account
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowAuthPrompt(false)} 
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedJob && !showAuthPrompt} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            {selectedJob?.company_profiles?.logo_url && (
              <div className="mb-4">
                <img
                  src={selectedJob.company_profiles.logo_url}
                  alt={selectedJob.company_profiles.company_name}
                  className="h-16 w-auto object-contain"
                />
              </div>
            )}
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              {selectedJob?.title}
            </DialogTitle>
            <DialogDescription>
              {selectedJob?.company_profiles?.company_name}
            </DialogDescription>
          </DialogHeader>
          {selectedJob && currentUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {selectedJob.location}
                </span>
                {selectedJob.hourly_rate_min && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-4 w-4" />
                    ${selectedJob.hourly_rate_min}
                    {selectedJob.hourly_rate_max && ` - $${selectedJob.hourly_rate_max}`}/hr
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedJob.employment_type?.map((type: string) => (
                  <Badge key={type} variant="outline">
                    {type}
                  </Badge>
                ))}
                {selectedJob.shift_type?.map((shift: string) => (
                  <Badge key={shift} variant="secondary">
                    {shift}
                  </Badge>
                ))}
              </div>

              {selectedJob.description && (
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground">{selectedJob.description}</p>
                </div>
              )}

              {selectedJob.requirements && (
                <div>
                  <h4 className="font-semibold mb-2">Requirements</h4>
                  <p className="text-sm text-muted-foreground">{selectedJob.requirements}</p>
                </div>
              )}

              <div className="pt-4 border-t">
                {hasApplied ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    You've expressed interest in this position
                  </div>
                ) : (
                  <Button onClick={handleInterest} className="w-full">
                    Express Interest
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default JobListings;