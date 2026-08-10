import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Search, MapPin, DollarSign, Briefcase, ThumbsUp, ThumbsDown, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface JobSearchProps {
  officerId: string | null;
}

const JobSearch = ({ officerId }: JobSearchProps) => {
  const [searchCity, setSearchCity] = useState("");
  const [searchState, setSearchState] = useState("");
  const [searchZip, setSearchZip] = useState("");
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [jobApplications, setJobApplications] = useState<Record<string, string>>({});
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (officerId) {
      loadJobApplications();
    }
  }, [officerId]);

  const loadJobApplications = async () => {
    if (!officerId) return;

    const { data } = await supabase
      .from("job_applications")
      .select("job_posting_id, status")
      .eq("officer_id", officerId);

    const applicationsMap: Record<string, string> = {};
    data?.forEach(app => {
      applicationsMap[app.job_posting_id] = app.status;
    });
    setJobApplications(applicationsMap);
  };

  const handleSearch = async () => {
    if (!searchCity && !searchState && !searchZip) {
      toast.error("Please enter at least one search criteria");
      return;
    }

    setLoading(true);
    setHasSearched(true);
    
    try {
      let query = supabase
        .from("job_postings")
        .select("*, company_profiles(company_name, logo_url)")
        .eq("status", "active");

      // Build search query for location field (it contains full address)
      const searchTerms = [];
      if (searchCity) searchTerms.push(searchCity.toLowerCase());
      if (searchState) searchTerms.push(searchState.toLowerCase());
      if (searchZip) searchTerms.push(searchZip);

      if (searchTerms.length > 0) {
        // Use ilike for case-insensitive partial matching
        const locationFilter = searchTerms.map(term => `location.ilike.%${term}%`).join(',');
        query = query.or(locationFilter);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      setJobs(data || []);
      
      if (data && data.length === 0) {
        toast.info("No jobs found matching your search criteria");
      }
    } catch (error: any) {
      console.error("Search error:", error);
      toast.error("Failed to search jobs. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleInterestClick = async (jobId: string, status: 'interested' | 'not_interested', event: React.MouseEvent) => {
    event.stopPropagation();

    if (!officerId) {
      toast.error("Please complete your profile to apply for jobs");
      return;
    }

    try {
      const job = jobs.find(j => j.id === jobId);
      
      const { error } = await supabase
        .from("job_applications")
        .upsert({
          job_posting_id: jobId,
          officer_id: officerId,
          status,
        }, {
          onConflict: 'job_posting_id,officer_id'
        });

      if (error) throw error;

      // Send message to employer if interested
      if (status === 'interested' && job) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single();

          const { error: msgError } = await supabase
            .from("messages")
            .insert({
              company_id: job.company_id,
              officer_id: officerId,
              sender_type: 'officer',
              message: `${profileData?.full_name || 'An officer'} is interested in your "${job.title}" position.`,
              is_read: false
            });
          
          if (msgError) {
            console.error('Failed to notify employer:', msgError);
          }
        }
      }

      toast.success(status === 'interested' ? "Added to interested jobs! Employer notified." : "Marked as not interested");
      setJobApplications(prev => ({ ...prev, [jobId]: status }));
      loadJobApplications();
    } catch (error: any) {
      console.error("Error:", error);
      toast.error(error.message);
    }
  };

  const handleClearSearch = () => {
    setSearchCity("");
    setSearchState("");
    setSearchZip("");
    setJobs([]);
    setHasSearched(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search Jobs by Location
          </CardTitle>
          <CardDescription>
            Find security job opportunities in your area
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="searchCity">City</Label>
              <Input
                id="searchCity"
                placeholder="e.g., Los Angeles"
                value={searchCity}
                onChange={(e) => setSearchCity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="searchState">State</Label>
              <Input
                id="searchState"
                placeholder="e.g., CA"
                value={searchState}
                onChange={(e) => setSearchState(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="searchZip">ZIP Code</Label>
              <Input
                id="searchZip"
                placeholder="e.g., 90001"
                value={searchZip}
                onChange={(e) => setSearchZip(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSearch} disabled={loading} className="flex-1">
              <Search className="h-4 w-4 mr-2" />
              {loading ? "Searching..." : "Search Jobs"}
            </Button>
            {hasSearched && (
              <Button onClick={handleClearSearch} variant="outline">
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {hasSearched && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results ({jobs.length})</CardTitle>
            <CardDescription>
              {jobs.length === 0 ? "No jobs found" : `Found ${jobs.length} job${jobs.length !== 1 ? 's' : ''}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div onClick={() => setSelectedJob(job)} className="cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold mb-1">{job.title}</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        {job.company_profiles?.company_name}
                      </p>
                    </div>
                    {job.company_profiles?.logo_url && (
                      <img
                        src={job.company_profiles.logo_url}
                        alt={job.company_profiles.company_name}
                        className="h-10 w-10 object-contain rounded"
                      />
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <MapPin className="h-4 w-4" />
                    {job.location}
                  </div>
                  
                  {job.hourly_rate_min && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                      <DollarSign className="h-4 w-4" />
                      ${job.hourly_rate_min}{job.hourly_rate_max && ` - $${job.hourly_rate_max}`}/hr
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mb-2">
                    {job.employment_type?.map((type: string) => (
                      <Badge key={type} variant="outline">
                        {type}
                      </Badge>
                    ))}
                    {job.shift_type?.map((shift: string) => (
                      <Badge key={shift} variant="secondary">
                        {shift}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {officerId && (
                  <div className="flex gap-2 pt-3 border-t">
                    <Button 
                      size="sm"
                      variant={jobApplications[job.id] === 'interested' ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={(e) => handleInterestClick(job.id, 'interested', e)}
                      disabled={jobApplications[job.id] === 'interested'}
                    >
                      {jobApplications[job.id] === 'interested' ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Interested
                        </>
                      ) : (
                        <>
                          <ThumbsUp className="h-3 w-3 mr-1" />
                          Interested
                        </>
                      )}
                    </Button>
                    <Button 
                      size="sm"
                      variant={jobApplications[job.id] === 'not_interested' ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={(e) => handleInterestClick(job.id, 'not_interested', e)}
                      disabled={jobApplications[job.id] === 'not_interested'}
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
      )}

      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
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
          {selectedJob && (
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobSearch;
